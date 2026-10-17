/**
 * agent 派单架构的接缝图：内容在 dispatch-map.data.mjs，坐标在 dispatch-map.layout.ts，画法在讲解组件包的 SeamDiagram。
 */
import { SeamDiagram } from '@godcreator/explainer/site';
import { dispatchGraph } from './dispatch-map.data.mjs';
import { dispatchLayout } from './dispatch-map.layout';

export function DispatchMap() {
  return <SeamDiagram graph={dispatchGraph} layout={dispatchLayout} />;
}
