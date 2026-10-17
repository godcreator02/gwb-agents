/**
 * agent 派单架构接缝图（dispatch-map.data.mjs）的坐标与图标。
 * 按依赖方向从上往下：协作站、QQ 云与 qq-bot、两个执行端插件、进程外的执行端与主会话。
 * 画布宽度压在 990：组件包给图定了 820 像素的最小宽度，正文栏比它窄时横向滚动，画布越宽字缩得越小。
 * 进框的竖线都落在框标题右边，第 7 条从 Claude Code 进程绕到最下方再沿右边上到协作站。
 */
import { Bot, Cloud, MessagesSquare, Monitor, Sparkles, SquareTerminal, Terminal } from 'lucide-react';
import { cap, type SeamLayout } from '@godcreator/explainer/site';

export const dispatchLayout: SeamLayout = {
  view: { w: 990, h: 710 },
  caps: {
    'cb-notify': cap(482, 70, 150),
    'cb-groups': cap(642, 70, 170),
    'cb-submit': cap(822, 70, 110),

    'qqc-events': cap(32, 250, 166),
    'qqc-send': cap(32, 302, 166),

    'qq-channel': cap(262, 250, 110),
    'qq-chats': cap(382, 250, 110),
    'qq-notify': cap(502, 250, 120),
    'qq-groups': cap(632, 250, 150),
    'qq-rounds': cap(262, 302, 120),

    'ca-rounds': cap(262, 450, 246),
    'zc-rounds': cap(572, 450, 210),
    'zc-window': cap(792, 450, 150),

    'ccp-agent': cap(262, 610, 246),
    'zd-agent': cap(572, 610, 196),
    'me-agent': cap(812, 610, 130),
  },
  groups: {
    collab: { x: 470, y: 20, w: 474, h: 120 },
    qqc: { x: 20, y: 214, w: 190, h: 146 },
    qqbot: { x: 250, y: 200, w: 544, h: 170 },
    ca: { x: 250, y: 400, w: 270, h: 110 },
    zcode: { x: 560, y: 400, w: 394, h: 110 },
    ccp: { x: 250, y: 560, w: 270, h: 110 },
    zd: { x: 560, y: 560, w: 220, h: 110 },
    me: { x: 800, y: 560, w: 154, h: 110 },
  },
  seamPaths: {
    '1': { d: 'M198,274 H262', badge: [214, 274] },
    '2': { d: 'M262,290 H240 V326 H198', badge: [240, 308] },
    '3': { d: 'M300,350 V380 H236 V474 H262', badge: [236, 430] },
    '4': { d: 'M460,498 V610', badge: [460, 540] },
    '5': { d: 'M557,118 V250', badge: [557, 170] },
    '6': { d: 'M707,118 V250', badge: [707, 170] },
    '7': { d: 'M385,658 V692 H975 V94 H932', badge: [700, 692] },
    '8': { d: 'M812,634 H790 V530 H860 V498 M790,530 H770 V498', badge: [825, 530] },
    '9': { d: 'M740,498 V610', badge: [740, 545] },
  },
  entries: {},
  moduleIcons: {
    collab: MessagesSquare,
    qqc: Cloud,
    qqbot: Bot,
    ca: SquareTerminal,
    zcode: SquareTerminal,
    ccp: Terminal,
    zd: Monitor,
    me: Sparkles,
  },
  entryIcons: {},
};
