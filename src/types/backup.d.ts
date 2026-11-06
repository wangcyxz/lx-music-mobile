declare namespace LX {
  namespace Backup {
    interface WebDavConfig {
      /** 服务器地址，例如 https://dav.example.com/dav/ */
      url: string
      /** 用户名 */
      user: string
      /** 密码 */
      password: string
      /** 远程备份目录名 */
      path: string
    }

    interface WebDavFileInfo {
      name: string
      /** 文件的完整访问地址（由 PROPFIND 的 href 还原） */
      url: string
      size: number
      mtime: number
    }
  }
}
