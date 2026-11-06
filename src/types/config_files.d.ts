declare namespace LX {
  namespace ConfigFile {
    interface MyListInfoPart {
      type: 'playListPart_v2'
      data: LX.List.MyDefaultListInfoFull | LX.List.MyLoveListInfoFull | LX.List.UserListInfoFull
    }

    /**
     * 配置备份文件（设置 / 自定义音源 / 列表 / 不喜欢列表）
     */
    interface ConfigBackup {
      type: 'lx_config_backup'
      version: string
      timestamp: number
      setting: Partial<LX.AppSetting>
      userApi?: Array<LX.UserApi.UserApiInfo & { script?: string }>
      playList?: Array<LX.List.MyDefaultListInfoFull | LX.List.MyLoveListInfoFull | LX.List.UserListInfoFull>
      dislikeRules?: string
    }

  }
}
