declare namespace LX {
  namespace UserApi {
    type UserApiSourceInfoType = 'music'
    type UserApiSourceInfoActions = 'musicUrl' | 'lyric' | 'pic'

    interface UserApiSourceInfo {
      name: string
      type: UserApiSourceInfoType
      actions: UserApiSourceInfoActions[]
      qualitys: LX.Quality[]
    }

    type UserApiSources = Record<LX.Source, UserApiSourceInfo>


    interface UserApiInfo {
      id: string
      name: string
      description: string
      // script: string
      allowShowUpdateAlert: boolean
      author: string
      homepage: string
      version: string
      sources?: UserApiSources
      /**
       * 在线导入时记录的脚本地址，用于检查更新
       */
      sourceUrl?: string
      /**
       * 最近一次检查更新的时间戳
       */
      lastCheckTime?: number
      /**
       * 最近一次检查到的远端版本号
       */
      latestVersion?: string
      /**
       * 远端是否存在新版本
       */
      hasUpdate?: boolean
      /**
       * 最近一次检查更新的错误信息
       */
      checkError?: string
    }

    interface UserApiUpdateCheckResult {
      id: string
      name: string
      currentVersion: string
      latestVersion: string
      hasUpdate: boolean
      error?: string
    }

    interface UserApiStatus {
      status: boolean
      message?: string
      apiInfo?: UserApiInfo
    }

    interface UserApiUpdateInfo {
      name: string
      description: string
      log: string
      updateUrl?: string
    }

    interface UserApiRequestParams {
      requestKey: string
      data: any
    }
    interface UserApiRequestParams {
      requestKey: string
      data: any
    }
    type UserApiRequestCancelParams = string
    type UserApiSetApiParams = string

    interface UserApiSetAllowUpdateAlertParams {
      id: string
      enable: boolean
    }

    interface ImportUserApi {
      apiInfo: UserApiInfo
      apiList: UserApiInfo[]
    }

  }
}
