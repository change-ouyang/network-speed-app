---
name: 流量消耗器 TC-1（机柜面板 RACK PANEL）
description: 一台亲手操作的机架网元设备：近黑拉丝机壳（暗）/喷粉米灰机箱（亮），LED 三色语义，LCD/VFD 计量窗，端口阵列与电源钮。
colors:
  # 亮色 = 喷粉米灰机箱（车间日光）
  accent-light: "#17573a"
  on-accent-light: "#f4fff7"
  danger-light: "#9c2018"
  bg-light: "#d3d0c8"
  chassis-light: "#e3e0d8"
  panel-light: "#eceae2"
  inset-light: "#f2f0e9"
  lcd-light: "#c3cfba"
  lcd-ink-light: "#1e2b1d"
  socket-light: "#b7b4a9"
  text-light: "#24272b"
  muted-light: "#5a5e56"
  hairline-light: "#b3afa3"
  hairline-strong-light: "#8f8b7f"
  led-green-light: "#23a457"
  shadow-light: "rgba(46, 42, 30, .28)"
  # 暗色 = 近黑拉丝机壳（机房夜灯）
  accent-dark: "#52e690"
  on-accent-dark: "#06130a"
  danger-dark: "#ff7a6e"
  bg-dark: "#0e1114"
  chassis-dark: "#161b20"
  panel-dark: "#1a2026"
  inset-dark: "#12171c"
  lcd-dark: "#0d130e"
  lcd-ink-dark: "#86ffb0"
  socket-dark: "#0b0e11"
  text-dark: "#e7eae3"
  muted-dark: "#9aa39a"
  hairline-dark: "#2c343c"
  hairline-strong-dark: "#3c4650"
  led-green-dark: "#37e07d"
  shadow-dark: "rgba(0, 0, 0, .45)"
typography:
  display:
    fontFamily: "-apple-system, MiSans, PingFang SC, Noto Sans SC, Microsoft Yahei, sans-serif"
    fontSize: "1.02rem"
    fontWeight: 700
    letterSpacing: "0.01em"
  body:
    fontFamily: "-apple-system, MiSans, PingFang SC, Noto Sans SC, Microsoft Yahei, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  label:
    fontFamily: "-apple-system, MiSans, PingFang SC, Noto Sans SC, Microsoft Yahei, sans-serif"
    fontSize: "0.84rem"
    fontWeight: 600
  code:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, Menlo, monospace"
    fontSize: "9.5px"
    fontWeight: 600
    letterSpacing: "0.16em"
  meter:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, Menlo, monospace"
    fontSize: "1.12rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
rounded:
  track: "2px"
  socket: "3px"
  dip: "4px"
  control-sm: "5px"
  control: "7px"
  meter: "8px"
  field: "9px"
  plate: "10px"
  module: "14px"
  power: "16px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
components:
  module-panel:
    backgroundColor: "{colors.panel-light}"
    rounded: "{rounded.module}"
    padding: "11px 14px 13px"
  meter-window:
    backgroundColor: "{colors.lcd-light}"
    textColor: "{colors.lcd-ink-light}"
    rounded: "{rounded.meter}"
    padding: "6px 8px 7px"
    height: "58px (min-height)"
  port-socket:
    backgroundColor: "{colors.socket-light}"
    rounded: "{rounded.socket}"
    height: "26px"
  field-inset:
    backgroundColor: "{colors.inset-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  button-action:
    backgroundColor: "{colors.panel-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.field}"
    padding: "9px 13px"
  button-primary:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.on-accent-light}"
    rounded: "{rounded.field}"
    padding: "8px 22px"
  dip-switch:
    backgroundColor: "{colors.socket-light}"
    rounded: "{rounded.dip}"
    width: "42px"
    height: "22px"
  unit-select:
    width: "88px"
    fontFamily: "{type.code}"
    rounded: "{rounded.input}"
  power-button:
    backgroundColor: "{colors.inset-light}"
    rounded: "{rounded.power}"
    width: "72px"
    height: "72px"
---

# Design System: 流量消耗器 TC-1（机柜面板 RACK PANEL）

## Overview

**Creative North Star: "机柜面板 RACK PANEL"**

这台设备不是一张网页，是一台你亲手操作的机架网元。类别默认的蓝色渐变仪表盘测速脸被整页拒绝：没有 hero 大数字漂浮在背景上，没有卡片阴影浮在白底上——数字住在内嵌的计量窗里，开关是真实的 DIP 拨码，弹窗是四颗螺丝的维护盖板。去掉全部内容文案，仅凭拉丝机壳、风扇格栅、端口阵列与电源钮，也能认出这是同一台机器。

两种模式是两间机房：暗色是机房夜灯下的近黑拉丝机壳（`#0e1114` 墙面、`#161b20` 机壳、VFD 绿字微辉）；亮色是车间日光下的喷粉米灰机箱（`#d3d0c8` 墙面、`#e3e0d8` 喷粉面板、经典绿底 LCD 深字）。两套都是主场景，各自完整成套，不是对方的反色。

深度是物理模具的方向：凹下去的是要读/要填的介质（LCD 窗、插口、输入框），凸起来的是可操作的表面（模块面板、按钮）。全机只有一次编排时刻——合上电源时计量窗数字从左扫亮（≤600ms）；其余一切动效都是器件状态（灯闪、拨码滑动、进度爬行），且在 `prefers-reduced-motion` 下全部停摆。

**Key Characteristics:**
- 双模式机壳材质：暗=拉丝（横向发丝纹），亮=喷粉哑光；纹理只属于暗壳
- LED 三色语义：绿=活动/在线，琥珀=警示/上限，红=危险；绝不装饰
- 计量窗介质二象：暗=VFD 绿字辉光，亮=绿底 LCD 深字；数字只住在窗里
- 全系统字体离线：系统无衬线 + 等宽两只声部；display=铭牌组合而非独立字体
- 状态总线：`body.running` 一个类驱动 RUN 灯、端口错相闪烁、电源钮描边、计量窗唤醒

## Colors

全系统唯一注入的颜色世界是「机壳材料色 + LED 发光色」两层；每种色在两种模式下各有一套值（上表 frontmatter 为准）。

### Primary
- **机房绿 Accent**（亮 `#17573a` / 暗 `#52e690`）：操作系统的「带电」色——选中节点、主按钮、线程读数、IP 地址、工具图标。亮色下绿走深以保证对比度，暗色下是 VFD 荧光绿。代码中存在 `--accent-deep` 别名槽（亮暗两模式值均与 `--accent` 相等），亮色规则默认写 `var(--accent-deep)`、暗色逐条覆盖为 `var(--accent)`——记录为现行的引用模式，值上二者同源。
- **绿上墨 On-Accent**（亮 `#f4fff7` / 暗 `#06130a`）：落在绿底上的墨色，用于选中文字（`::selection`）与主按钮文字。暗色配深墨、亮色配浅墨，跟随机壳翻转。

### Secondary
- **LED 绿**（亮 `#23a457` / 暗 `#37e07d`）：设备指示灯专用绿，与 Accent 绿是两种器件：LED 绿长在灯泡上（PWR/RUN 灯、端口 LED 条、带宽段条、开关选中描边、键盘焦点环），Accent 绿长在面板丝印上（选中态、主按钮）。两绿不混用。

### Tertiary
- **危险红 Danger**（亮 `#9c2018` / 暗 `#ff7a6e`）：免责声明框、删除动作、退出按钮、报错文字。边框用 `color-mix(in srgb, var(--danger) 40%, transparent)` 褪色铸框。

### Neutral
- **车间墙面 BG**（亮 `#d3d0c8` / 暗 `#0e1114`）：页面底。
- **机箱喷粉 Chassis**（亮 `#e3e0d8` / 暗 `#161b20`）：铭牌顶栏与资产铭牌的机壳本体；暗色下叠拉丝发丝纹。
- **模块面板 Panel**（亮 `#eceae2` / 暗 `#1a2026`）：每个模块的面板与浮层（下拉、弹窗、toast、凸按钮）底色。
- **浅凹面 Inset**（亮 `#f2f0e9` / 暗 `#12171c`）：所有凹进去的介质底——输入框、选择器触发区、滑杆拇指、电源钮面。
- **LCD 面 / LCD 墨**（亮 `#c3cfba`+`#1e2b1d` / 暗 `#0d130e`+`#86ffb0`）：计量窗的二象介质，见 Named Rules。
- **插口 Socket**（亮 `#b7b4a9` / 暗 `#0b0e11`）：端口插口与 DIP 开关槽的空腔色——灯灭时的底。
- **正文 / 次要文字**（亮 `#24272b`+`#5a5e56` / 暗 `#e7eae3`+`#9aa39a`）：正文与铭注、型号代号、地理行、诊断行。
- **发丝线 Hairline / 强发丝线**（亮 `#b3afa3`+`#8f8b7f` / 暗 `#2c343c`+`#3c4650`）：全部 1px 边框的两级；弱线分模块内部，强线分机壳边界与可操作件轮廓。
- **机影 Shadow**（亮 `rgba(46,42,30,.28)` / 暗 `rgba(0,0,0,.45)`）：唯一的投影色 token，暖调偏褐（车间灯光下的影子）。

### Named Rules
**LED 三色律（The LED Tricolor Rule）。** 绿=活动/在线，琥珀=警示/上限，红=危险。LED 色永不作装饰、永不当 Accent 用；反之 Accent 绿也永不点亮灯泡。LED 的辉光（`0 0 4–5px`）是发光器件的介质本性，不算「加 glow」。

**介质二象律（The Meter Duality Rule）。** 计量窗在两种模式下是两种物理介质：暗色是 VFD 荧光管（近黑底 `#0d130e`、荧光绿字 `#86ffb0`、`text-shadow: 0 0 7px rgba(82,230,144,.3)` 微辉）；亮色是经典 LCD（灰绿底 `#c3cfba`、深墨字 `#1e2b1d`、无辉）。改计量窗时先问「这块屏是什么介质」，而不是「这个绿色调好不好看」。

**两绿分工律。** Accent 绿是丝印/数据色，LED 绿是灯泡色（见 Secondary）；任何表面不得同时消费两种绿。

## Typography

**Display 声部：铭牌组合（被记录的改编事实）**
**Body Font：** `-apple-system, "MiSans", "PingFang SC", "Noto Sans SC", "Microsoft Yahei", sans-serif`（离线约束，全系统字体栈）
**Label/Code/Meter Font：** `ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace`

PRODUCT.md 的离线约束排除了外部字体，故本世界没有独立 display 字体；display 声部由「铭牌组合」承担：粗体系统无衬线型号名（700 / 1.02rem / letter-spacing .01em）压在上方，下方一行 9.5px 等宽、加宽字距（.14em）、全大写的英文型号代号（`TC-1 · THROUGHPUT CONSUMER`）。粗标题 + 追踪等宽代号的并置就是本机的「大字」——这是构建事实，不是待补的缺口。

### Hierarchy
- **Display／铭牌**（700，1.02rem，ls .01em）：设备名与弹窗标题；弹窗标题同规格（ls .02em）。
- **Meter／读数**（mono 700，1.12rem，ls -0.01em，`font-variant-numeric: tabular-nums`）：计量窗数字——全机最大的字，也只有 1.12rem。IP 地址与线程数同声部（1.02rem / 1rem）。
- **Body**（400，15px）：正文基准；行高按语境 1.55（状态行）–1.7（弹窗长文）。
- **Label**（600，0.84rem）：模块中文主标（下行链路/线程配置/计量/电源与开关）与开关名。
- **Code／丝印代号**（mono 600，9.5px，ls .16em，大写）：模块英文代号 LINK / PORTS / METERING / POWER / NET；同族还有 9px（NET 铭牌）与 7px（端口插口内铸的端口号）。等宽族同时服务读数与丝印——等宽在本机是「机器写的字」。

### Named Rules
**数字入窗律（The Numbers-Live-in-Windows Rule）。** 读数永远是 `tabular-nums` 等宽、永远住在计量窗/铭牌等实体介质里；页面上不存在漂浮的大号装饰数字。字号阶梯因此极压缩（7px–1.12rem）：层级靠介质与声部区分，不靠放大。

**铭牌即 Display 律（The Nameplate-Is-Display Rule）。** 任何新表面的「标题」= 中文粗体名 + 等宽追踪英文代号的组合，而不是换一款 display 字体或加大字号。

## Layout

竖屏单列机箱：`.chassis` 居中，`max-width: 640px`，`min-width: 320px`，页边 12px。模块纵向堆叠，节奏 `margin-top: 10px`；模块内边距 `11px 14px 13px`。所有贴边表面（铭牌顶栏、机箱）用 `env(safe-area-inset-*)` 让位刘海与手势条。铭牌顶栏 `position: sticky` 常驻。

固定栅格只有两处：端口阵列 `repeat(16, 1fr)`（32 口两行，gap 6px 3px，一页展示密度）与计量三联窗 `1fr 1fr 1fr`（gap 8px）。z 轴梯队：铭牌 10 < 下拉面板 30 < 维护盖板 60 < toast 99。返回键逐层关闭浮层（无浮层才退出）。

主操作（电源钮 72px）位于首屏下半部拇指区；页面按 412×760 一页展示实测零溢出；长挂工具，视觉不添乱——密度是「设备面板」的密度，不是「营销页」的密度。页面 `user-select: none`，仅输入框放开文本选择；滚动条全部隐藏。

间距节奏（frontmatter spacing 为准）：6px（紧凑图标隙）/ 8px（组件内隙、三联窗隙）/ 10px（模块纵节奏）/ 12px（页边、行隙）/ 14px（模块水平边距、开关列隙）。

## Elevation & Depth

无「白卡片浮阴影」体系。深度是注塑模具的两个方向，全部由 `--shadow` token 加内/外阴影构成：

- **凸面（可操作）**：模块面板 `inset 0 1px 0 rgba(255,255,255,.28), 0 3px 10px var(--shadow)`；按钮 `0 1px 0 rgba(255,255,255,.35), 0 2px 4px var(--shadow)`。每件凸面必带 1px 顶缘高光（车间顶光打在塑料件上的 specular），暗色下高光减到 .045–.06（夜灯下塑料不反光）。
- **凹面（介质）**：输入框/选择器 `inset 0 2px 5px`；端口阵列 `inset 0 2px 6px`；计量窗 `inset 0 3px 9px`——越深的介质阴影越深。铭牌底缘 `inset 0 -6px 12px -8px` 铸出机壳台阶。
- **按压**：`:active` 一律 `translateY(1px)` + 阴影清空——按下去是物理下沉，不是缩放。
- **浮层**：维护盖板 `0 10px 34px rgba(0,0,0,.4)`；遮罩 `rgba(10,12,10,.55)`。
- **辉光**：只属于发光体——LED 灯 `0 0 4–5px var(--led-green)`、VFD 字微辉（暗色计量窗）。非发光表面零辉光。

### Shadow Vocabulary
- **raised-panel**（`inset 0 1px 0 rgba(255,255,255,.28), 0 3px 10px var(--shadow)`）：模块与弹窗面板；暗色下高光换 .045。
- **button-lift**（`0 1px 0 rgba(255,255,255,.35), 0 2px 4px var(--shadow)`）：全部凸按钮（manual / m-btn / 滑杆拇指）；暗色高光换 .05。
- **well-inset**（`inset 0 2px 5px var(--shadow)`）：输入与选择触发区。
- **well-deep**（`inset 0 3px 9px var(--shadow)`）：计量窗 LCD。
- **modal-lift**（`0 10px 34px rgba(0,0,0,.4)`)：维护盖板弹窗。

### Named Rules
**凹读凸作律（The Recess-Reads-Rule）。** 凹面=读数或填充的介质（LCD、插口、输入框），凸面=可以按的表面（模块、按钮）。深度的方向就是可供性的方向；新器件先决定它凹还是凸，再谈样式。

**顶缘高光律。** 每件凸面带 1px 顶缘 specular 内阴影；亮色 .26–.35，暗色一律压到 .05 上下——夜灯机房里没有高光。

## Shapes

半径随器件尺寸走（frontmatter rounded 十档为全部真实值）：LED 条/滑轨 2px → 插口/DIP 滑块/格栅 3px → DIP 槽体 4px → 小图标钮/滑杆拇指 5px → 图标钮 7px → 计量窗/小按钮 8px → 输入区/动作钮/下拉/toast 9px → 资产铭牌 10px（`--radius`）→ 模块/弹窗 14px（`--radius-lg`）→ 电源钮 16px。仅 10/14px 已 token 化，其余为字面值——新器件按同尺度曲线取值，不新造中间档。

边框语言是两级发丝线：模块内部分界用弱线，机壳边界与可操作件轮廓用强线，全部 1px。电源钮护圈是唯一的虚线（dashed，运行时转绿）。功能性几何纹样：风扇格栅（46×30px 横条 repeating-linear-gradient，opacity .55）、暗壳拉丝（仅 `.nameplate`/`.asset-plate` 的横向发丝纹）、带宽 LED 段条（5px 亮 / 2px 隙的 repeating 渐变，经 `clip-path: inset(0 calc(100% - var(--w)) 0 0)` 从右向左揭示）、资产条码（SVG 几何条）、盖板螺丝（radial-gradient 圆点，上下各一对）。计量的动态揭示也用 clip-path（`meter-wake` 从左扫亮）。

## Components

每个组件先一句话性格，再给规格；全部值以 `www/css/theme.css` 为 ground truth。

### 铭牌顶栏（Nameplate）
设备身份证，常驻吸顶。机壳底（chassis）+ 底缘强发丝线 + 底缘内阴台阶；左侧风扇格栅、中间铭牌组合（Display 声部）、右侧 PWR/RUN 双灯（9px 圆点，PWR 常绿，RUN 由 `body.running` 点亮，带 .12s 延迟——合电时灯序有先后）+「说明」按钮。

### 模块（Module）
机箱里的标准槽位件。Panel 底、弱线框、14px 圆角、凸面阴影；首行 module-tag = 中文主标（Label 声部）+ 右侧英文丝印代号（Code 声部），底部弱线下划。四个模块：LINK / PORTS / METERING / POWER。

### 端口阵列（Port Array）——签名组件
线程配置的物理化身：32 只插口（Socket 底 + 强线框 + 3px 圆角），端口号以 7px 等宽铸在插口内，LED 条（3.5px 高）压在插口底部。亮灯数 = 配置的线程数（`port <= n` 加 `.on`；n 由滑杆/存储值传入，不读引擎运行态——两处必须同源）；运行中按 `--d = ((port-1) % 8) × 0.09s` 错相闪烁（`port-blink 1s steps(2, jump-none) infinite`），点亮时插口框线向 LED 绿靠（`color-mix 45%`）。JS 只写类与 `--d`，一切呈现归 CSS。

### 计量窗（Meter Window）
三联窗：LCD 面底 + 深凹阴影 + 8px 圆角；窗头 0.74rem 标签（暗色下转 muted）+ 角上图标针钮；读数钉在窗底（`margin-top: auto`），Meter 声部 + `tabular-nums`。带宽窗多一条 7px LED 段条：JS 只写 `--w`（0–500Mbps 线性映射），clip-path 揭示，`transition: clip-path .4s`。

### 电源钮（Power Button）——签名组件
72×72px 工业主开关（一页展示压缩后尺寸），12px 圆角，凹面（inset）底上的凸影；内嵌 5px 虚线护圈；34px 电源/暂停描线图标。运行中（`body.running`）：钮缘与护圈转 LED 绿。按压下沉 1px。

### DIP 拨码开关（DIP Switch）
42×22px 方形滑槽（Socket 空腔 + 内凹阴影）+ 16px 方形滑块（3px 圆角、顶缘高光）；拨上 `translateX(20px)`，选中时槽与滑块描边转 LED 绿。两只：后台运行 / 自动运行。

### 单位下拉（Unit Select）
数字 + 单位成对输入件（`.unit-row`）：m-input 占 flex:1 且行内 `margin-top:0`（吃掉 m-input 自带的 6px 顶距），`.unit-dd`（96px）钉在右侧，触发钮 stretch 到输入框同高。单位面板是自定义浮层（fixed 挂 body、与触发钮右对齐），不用原生 `<select>`——系统弹层的定位/样式不可控，且 `.modal-body` 的 overflow 会裁剪内嵌浮层。用量上限（MB/GB）与限速（MB/s、GB/s）共用；存储恒为字节，重开弹框时按 ≥1GB 自动回选 GB 并回填纯数字。

### 选择器（Select）
触发区是凹面输入（inset 底 + 强线框 + 9px 圆角 + 内凹阴影），左链路图标（Accent 绿）、右展开箭头（`.open` 旋转 180°）。下拉面板 = 凸面板浮层（z 30），分组标题用 Code 声部（.78rem），选中项 Accent 绿加粗。键盘：Enter/Space 展开与选中；`focus-visible` 用 Accent 内描边（-2px）。

### 按钮（Buttons）
三档语法：图标针钮（pin/panel-btn，30px 方，7px 圆角，inset 底，muted 图标）／动作钮（manual、m-btn：panel 底 + 强线框 + 9px 圆角 + 按压下沉）／m-btn 变体（primary=Accent 底绿上墨；plain=inset 底；danger=Danger 底白字）。无 hover 特效——触屏设备，状态只有按压。

### 维护盖板（Modal）——签名组件
弹窗即检修盖板：panel 底、14px 圆角、上下各一对螺丝（radial-gradient 圆点随宽自适应贴角）。标题居中（Display 规格），正文 0.92rem/1.7，输入框为凹面 m-input（聚焦转 Accent 边）。遮罩点击关闭。

### 资产铭牌（Asset Plate）与 Toast
铭牌：机壳底（暗色下拉丝）+ 10px 圆角，NET 丝印、IP（Meter 声部 Accent 绿）、地理行、出厂条码 + 序列号。Toast：底部 12% 悬浮的机壳窄条（9px 圆角、强线框、6px 投影），一次性状态播报。

### Named Rules
**唯一编排时刻律（The One Authored Moment Rule）。** 全机只有 `meter-wake`（合电源时计量窗从左扫亮 + 亮度 1.6→1，.45s ease-out，≤600ms）一次编排；其余动效全是器件状态（灯闪、拨码、进度、箭头，.18–.4s）。`prefers-reduced-motion` 下动画与过渡全部停摆，包括灯闪。

**状态总线律。** 运行态只通过 `body.running` 一个类广播（RUN 灯、端口闪烁、电源钮描边、计量窗唤醒全部挂在它上面）；JS 不逐件改样式，只写类与 `--d`/`--pct`/`--w` 三个自定义属性。

## Do's and Don'ts

### Do:
- **Do** LED 严格三色语义：绿=活动/在线、琥珀=警示/上限、红=危险；新指示灯先归语义再取色。
- **Do** 数字一律 Meter 声部（等宽 + `tabular-nums`）并住进计量窗/铭牌介质里。
- **Do** 新「标题」用铭牌组合：中文粗体名 + 等宽追踪大写英文代号。
- **Do** 器件先定凹凸：读/填的凹下去配内阴影，可按的凸起来配顶缘高光；按压一律 `translateY(1px)` 下沉。
- **Do** 双模式成对交付：每个颜色/高光/介质效果亮暗各验一遍（拉丝只验暗壳，LCD 辉光只验暗窗）。

### Don't:
- **Don't** 引入蓝色仪表盘脸：类别默认的蓝色渐变测速页是本世界的反面。
- **Don't** 给非发光表面加辉光；LED/VFD 的光是介质本性，不是装饰手法。
- **Don't** 用 LED 绿画丝印/数据，或用 Accent 绿点灯——两绿分工不可混。
- **Don't** 在亮色机壳上加拉丝或高光纹理；喷粉面是哑光的。
- **Don't** 超过一次编排时刻或绕过 `prefers-reduced-motion` 静音。
- **Don't** 引入外部字体/图标 CDN——离线约束（PRODUCT.md），全部系统栈 + 内联 SVG。
- **Don't** 把 LED 色或 Accent 用作大面积底色；发光色是小面积的器件语言。
