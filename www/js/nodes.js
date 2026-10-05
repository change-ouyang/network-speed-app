// 节点清单：整理自 270666.xyz 公开测速节点（2026-10-05 实测抓取），App 端经原生网络栈直连
// disabled: true 的分组保留数据但不展示（全球海外组，按需求停用）
window.NODE_GROUPS = [
  {
    label: "热门应用",
    options: [
      { label: "微软商店", value: "https://cdn.microsoftstore.com.cn/media/product_long_description/3781-00000/2_dupn50xr/4h0yzz2_360.jpg" },
      { label: "腾讯游戏", value: "https://ossweb-img.qq.com/images/lol/web201310/skin/big10001.jpg" },
      { label: "快手", value: "https://alimov2.a.kwimgs.com/upic/2024/11/18/17/BMjAyNDExMTgxNzM0NTFfMjQ2MzY1ODI4MV8xNDg5NTc1NTQwNDBfMl8z_b_Ba0e085802ad867415b13e560bab69dd2.mp4" },
      { label: "Bilibili", value: "https://s1.hdslb.com/bfs/game-static/web/caster/static/script/vue/da3f37d7fd8339357ed671a94941757e/st.zip" },
      { label: "爱奇艺", value: "https://static-d.iqiyi.com/ext/common/iQIYIMedia_000.dmg" },
      { label: "腾讯视频", value: "https://puui.qpic.cn/vpic_cover/g3346tki83w/g3346tki83w_hz.jpg" },
      { label: "头条/抖音", value: "https://lf3-beecdn.bytetos.com/obj/ies-fe-bee/bee_prod/biz_809/tos_b3410a051c43208d6673cd44e9aeacdc.mp4" },
      { label: "OPPO", value: "https://dsfs.oppo.com/oppo/shop-pc-v2/main/js/9fb472f.js" },
      { label: "VIVO", value: "https://wwwstatic.vivo.com.cn/vivoportal/files/resource/funtouch/1651200648928/images/os2-jude-video.mp4" },
      { label: "UC/夸克", value: "https://image.uc.cn/s/uae/g/3o/broccoli/resource/202401/zry_video.mp4" }
    ]
  },
  {
    label: "运营商",
    options: [
      { label: "咪咕快游", value: "https://gcache.migu.cn/prod/upload/game_resource/channel_for_homepage_game2/202412/0310/44/20241203104444766.mp4" },
      { label: "咪咕视频", value: "https://img.cmvideo.cn/publish/noms/2026/02/26/1O7F0QHGQP2FD.gif" },
      { label: "移动云盘", value: "https://img.mcloud.139.com/material_prod/material_media/20221128/1669626861087.png" },
      { label: "联通门户", value: "https://iservice.10010.com/wt_manage/uploadImg/1709710916113.jpg" },
      { label: "天翼云桌面", value: "https://desk.ctyun.cn:8999/desktop-prod/software/android_client/20/64/102010101/clouddesktoc_phone_2.1.1_452_prod_102010101_2.1.1_signed.apk" }
    ]
  }
];

// 保留海外组数据，随时可重新启用（App 原生网络无跨域限制）
window.NODE_GROUPS_DISABLED = [
  {
    label: "全球海外",
    options: [
      { label: "Cachefly", value: "https://cachefly.cachefly.net/100mb.test" },
      { label: "Cloudflare Speed", value: "https://speed.cloudflare.com/__down?bytes=25000000" },
      { label: "Vultr_SGP", value: "https://sgp-ping.vultr.com/vultr.com.1000MB.bin" },
      { label: "Steam Akamai", value: "https://cdn.akamai.steamstatic.com/steam/apps/1063730/extras/NW_Sword_Sorcery_2.gif" },
      { label: "Steam Cloudflare", value: "https://cdn.cloudflare.steamstatic.com/steam/apps/1063730/extras/NW_Sword_Sorcery_2.gif" },
      { label: "Microsoft Akamai", value: "https://img-prod-cms-rt-microsoft-com.akamaized.net/cms/api/am/imageFileData/RW16Ptm" }
    ]
  }
];
