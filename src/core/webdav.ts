import BackgroundTimer from 'react-native-background-timer'

import { downloadFile, readFile, temporaryDirectoryPath, unlink } from '@/utils/fs'

/** 备份文件扩展名（本地与 WebDAV 统一为 JSON 文本） */
export const BACKUP_FILE_EXT = 'json'

const DEFAULT_PATH = 'lx-music-backup'

/** 按路径分段编码，避免中文目录名导致请求被服务端拒绝 */
const encodePath = (path: string) => path.split('/').filter(Boolean).map(encodeURIComponent).join('/')

/**
 * 规范化服务器地址：补全协议、去掉末尾斜杠
 * 坚果云的 WebDAV 根目录必须带 /dav 前缀，这里自动补上
 */
export const normalizeUrl = (url: string) => {
  let result = url.trim()
  if (!result) return result
  if (!/^https?:\/\//i.test(result)) result = `https://${result}`

  const match = /^(https?:\/\/[^/]+)(\/.*)?$/i.exec(result)
  if (!match) return result

  const host = match[1]
  let path = match[2] ?? ''
  if (/dav\.jianguoyun\.com$/i.test(host) && !/^\/dav(\/|$)/i.test(path)) {
    path = `/dav${path}`
  }
  // 中文等字符的目录名必须编码，否则服务端会直接拒绝请求
  return `${host}${path ? `/${encodePath(path)}` : ''}`
}

/**
 * 拼接远程备份目录地址
 */
export const buildBaseUrl = (config: LX.Backup.WebDavConfig) => {
  const url = normalizeUrl(config.url)
  const path = encodePath(config.path || DEFAULT_PATH)
  return path ? `${url}/${path}` : url
}

const buildFileUrl = (config: LX.Backup.WebDavConfig, fileName: string) => {
  return `${buildBaseUrl(config)}/${encodeURIComponent(fileName)}`
}

const buildHeaders = (config: LX.Backup.WebDavConfig) => {
  const headers: Record<string, string> = { Accept: '*/*' }
  if (config.user || config.password) {
    const token = Buffer.from(`${config.user ?? ''}:${config.password ?? ''}`).toString('base64')
    headers.Authorization = `Basic ${token}`
  }
  return headers
}

const PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:"><D:prop><D:displayname/><D:getcontentlength/><D:getlastmodified/><D:resourcetype/></D:prop></D:propfind>'

interface RawResponse {
  statusCode: number
  body: string
}

/**
 * 去掉 XML/HTML 标签，取出服务端返回的简要错误信息
 */
const brief = (body: string) => {
  if (!body) return ''
  const text = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > 120 ? `${text.substring(0, 120)}...` : text
}

const request = async(
  url: string,
  method: string,
  config: LX.Backup.WebDavConfig,
  options: { body?: string, headers?: Record<string, string>, timeout?: number } = {},
): Promise<RawResponse> => {
  const controller = new AbortController()
  const timer = BackgroundTimer.setTimeout(() => {
    controller.abort()
  }, options.timeout ?? 30_000)
  try {
    // 直接使用 fetch：WebDAV 方法必须是大写，且响应不能被 JSON 解析污染
    const resp = await global.fetch(url, {
      method: method.toUpperCase(),
      headers: { ...buildHeaders(config), ...options.headers },
      ...(options.body != null ? { body: options.body } : {}),
      signal: controller.signal,
    })
    const body = await resp.text()
    return { statusCode: resp.status, body }
  } finally {
    BackgroundTimer.clearTimeout(timer)
  }
}

const checkStatus = (resp: RawResponse, allowStatus: number[]) => {
  if (allowStatus.includes(resp.statusCode)) return resp
  const message = brief(resp.body)
  throw new Error(`HTTP ${resp.statusCode}${message ? ` - ${message}` : ''}`)
}

/** 将 PROPFIND 返回的 href 还原为可直接请求的完整地址 */
const resolveUrl = (baseUrl: string, href: string) => {
  const raw = (href ?? '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/')) {
    const origin = /^(https?:\/\/[^/]+)/i.exec(baseUrl)?.[1]
    return origin ? origin + raw : raw
  }
  return `${baseUrl}/${raw}`
}

/**
 * 解析 PROPFIND 返回的 XML 文件列表
 */
const parsePropfind = (xml: string, baseUrl: string): LX.Backup.WebDavFileInfo[] => {
  const items: LX.Backup.WebDavFileInfo[] = []
  const responses = xml.match(/<(?:\w+:)?response\b[\s\S]*?<\/(?:\w+:)?response>/gi) ?? []
  for (const item of responses) {
    if (/<(?:\w+:)?collection\s*\/>/i.test(item)) continue
    const href = /<(?:\w+:)?href[^>]*>([\s\S]*?)<\/(?:\w+:)?href>/i.exec(item)?.[1] ?? ''
    let name = decodeURIComponent(href.replace(/\/+$/, '').split('/').pop() ?? '')
    if (!name) {
      name = decodeURIComponent(/<(?:\w+:)?displayname[^>]*>([\s\S]*?)</i.exec(item)?.[1] ?? '')
    }
    if (!name || !new RegExp(`\\.${BACKUP_FILE_EXT}$`, 'i').test(name)) continue
    const size = Number(/<(?:\w+:)?getcontentlength[^>]*>(\d+)</i.exec(item)?.[1] ?? 0)
    const mtimeText = /<(?:\w+:)?getlastmodified[^>]*>([\s\S]*?)</i.exec(item)?.[1] ?? ''
    const mtime = mtimeText ? new Date(mtimeText).getTime() : 0
    items.push({ name, url: resolveUrl(baseUrl, href) || `${baseUrl}/${encodeURIComponent(name)}`, size, mtime })
  }
  return items.sort((a, b) => b.mtime - a.mtime)
}

/**
 * 创建远程备份目录（已存在时返回成功）
 */
export const ensureWebDavDir = async(config: LX.Backup.WebDavConfig) => {
  if (!config.url.trim()) throw new Error(global.i18n.t('webdav_config_required'))
  const resp = await request(buildBaseUrl(config), 'mkcol', config)
  // 405/409 表示目录已存在
  return checkStatus(resp, [200, 201, 204, 405, 409])
}

const listFiles = async(config: LX.Backup.WebDavConfig): Promise<LX.Backup.WebDavFileInfo[]> => {
  if (!config.url.trim()) throw new Error(global.i18n.t('webdav_config_required'))
  const baseUrl = buildBaseUrl(config)
  const resp = await request(baseUrl, 'propfind', config, {
    headers: { Depth: '1', 'Content-Type': 'text/xml; charset=utf-8' },
    body: PROPFIND_BODY,
  })
  checkStatus(resp, [200, 207])
  return parsePropfind(resp.body, baseUrl)
}

/**
 * 测试连接：创建目录 → 上传探针文件 → 下载探针文件 → 删除探针 → 列出文件
 * 完整走一遍读写流程，可以直接定位 GET 失败等服务端问题
 */
export const testWebDavConnection = async(config: LX.Backup.WebDavConfig) => {
  const baseUrl = buildBaseUrl(config)
  if (!config.url.trim()) throw new Error(global.i18n.t('webdav_config_required'))

  await ensureWebDavDir(config)

  const probeName = '.lx_webdav_probe.json'
  const probeUrl = `${baseUrl}/${probeName}`
  const uploadResp = await request(probeUrl, 'put', config, {
    body: '{"probe":true}',
    headers: { 'Content-Type': 'application/json' },
    timeout: 20_000,
  })
  checkStatus(uploadResp, [200, 201, 204])

  try {
    const downloadResp = await request(probeUrl, 'get', config, { timeout: 20_000 })
    checkStatus(downloadResp, [200])
  } finally {
    await request(probeUrl, 'delete', config, { timeout: 20_000 }).catch(() => {})
  }

  await listFiles(config)
  return true
}

/**
 * 获取远程备份文件列表
 */
export const listWebDavFiles = async(config: LX.Backup.WebDavConfig): Promise<LX.Backup.WebDavFileInfo[]> => {
  return listFiles(config)
}

/**
 * 上传备份内容到 WebDAV
 */
export const uploadWebDavFile = async(config: LX.Backup.WebDavConfig, fileName: string, content: string) => {
  await ensureWebDavDir(config)
  const resp = await request(buildFileUrl(config, fileName), 'put', config, {
    body: content,
    headers: { 'Content-Type': 'application/json' },
    timeout: 60_000,
  })
  return checkStatus(resp, [200, 201, 204])
}

/**
 * 用原生下载通道下载备份内容（与音乐下载同一条通道，兼容对请求头挑剔的服务端）
 */
const nativeDownload = async(config: LX.Backup.WebDavConfig, urls: string[]): Promise<string> => {
  const tempPath = `${temporaryDirectoryPath}/lx_webdav_${Date.now()}.${BACKUP_FILE_EXT}`
  let lastMessage = ''
  try {
    for (const url of urls) {
      try {
        const result = await downloadFile(url, tempPath, {
          headers: buildHeaders(config),
          connectionTimeout: 20_000,
          readTimeout: 60_000,
        }).promise
        if (result.statusCode == 200) {
          return await readFile(tempPath)
        }
        lastMessage = `HTTP ${result.statusCode}`
      } catch (err: any) {
        lastMessage = (err?.message as string) ?? ''
      }
    }
  } finally {
    await unlink(tempPath).catch(() => {})
  }
  throw new Error(lastMessage || 'download failed')
}

/**
 * 从 WebDAV 下载备份内容
 * 依次尝试：列表返回的完整地址 → 按文件名拼出的地址，fetch 全部失败后再走原生下载通道
 */
export const downloadWebDavFile = async(config: LX.Backup.WebDavConfig, file: LX.Backup.WebDavFileInfo): Promise<string> => {
  if (!config.url.trim()) throw new Error(global.i18n.t('webdav_config_required'))

  const urls = [...new Set([
    file.url,
    buildFileUrl(config, file.name),
    `${buildBaseUrl(config)}/${file.name}`,
  ])].filter(url => !!url)

  let lastResp: RawResponse | null = null
  for (const url of urls) {
    let resp: RawResponse
    try {
      resp = await request(url, 'get', config, { timeout: 60_000 })
    } catch {
      // 网络层错误（超时/中断）时继续尝试下一个地址
      continue
    }
    if (resp.statusCode == 200) return resp.body
    lastResp = resp
    // 400/404 时才换地址重试，其他错误直接抛出
    if (resp.statusCode != 400 && resp.statusCode != 404) break
  }

  const nativeResult = await nativeDownload(config, urls).catch(() => null)
  if (nativeResult?.length) return nativeResult

  if (lastResp) checkStatus(lastResp, [200])
  throw new Error('download failed')
}

/**
 * 删除远程备份文件
 */
export const deleteWebDavFile = async(config: LX.Backup.WebDavConfig, file: LX.Backup.WebDavFileInfo) => {
  if (!config.url.trim()) throw new Error(global.i18n.t('webdav_config_required'))
  const resp = await request(buildFileUrl(config, file.name), 'delete', config)
  return checkStatus(resp, [200, 202, 204, 404])
}
