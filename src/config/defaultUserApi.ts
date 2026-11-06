/**
 * 内置在线音源：首次启动时自动写入自定义源列表
 */
export interface DefaultUserApiSource {
  /** 列表显示的音源名称 */
  name: string
  /** 在线脚本地址（同时作为更新检查的订阅地址） */
  url: string
}

export const DEFAULT_USER_API_SOURCES: DefaultUserApiSource[] = [
  {
    name: '野花🌷v1',
    url: 'https://cdn.jsdelivr.net/gh/pdone/lx-music-source@main/flower/latest.js',
  },
  {
    name: 'grass v1',
    url: 'https://cdn.jsdelivr.net/gh/pdone/lx-music-source@main/grass/latest.js',
  },
  {
    name: 'LX',
    url: 'https://cdn.jsdelivr.net/gh/pdone/lx-music-source@main/lx/latest.js',
  },
  {
    name: '汇百泉 (Huibq)',
    url: 'https://fastly.jsdelivr.net/gh/Huibq/keep-alive/render_api.js',
  },
  {
    name: 'ikun',
    url: 'https://cdn.jsdelivr.net/gh/pdone/lx-music-source@main/ikun/latest.js',
  },
  {
    name: '聚合 (Juhe)',
    url: 'https://cdn.jsdelivr.net/gh/pdone/lx-music-source@main/juhe/latest.js',
  },
]
