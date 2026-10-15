export type ClusteringMethod = 'undirected' | 'directed' | 'scc' | 'label' | 'louvain' | 'flow' | 'spectral';
export type LayoutMethod = 'grouped' | 'condensation' | 'layered' | 'force' | 'stress' | 'radial' | 'circle' | 'spectral';
export interface Field { key: string; label: string; value: number; min: number; max: number; step: number }
export interface Method<Id extends string> { id: Id; label: string; description: string; paper: string; url?: string; fields: Field[] }
const field = (key: string, label: string, value: number, min: number, max: number, step = 1): Field => ({ key, label, value, min, max, step });
export const clusteringMethods: Method<ClusteringMethod>[] = [
  { id: 'undirected', label: '無向モジュラリティ', description: '参照の方向を除いた一意の辺を使い、無向 Q が増える群の結合を繰り返します。', paper: 'Clauset, Newman & Moore (2004)', url: 'https://arxiv.org/abs/cond-mat/0408187', fields: [] },
  { id: 'directed', label: '有向モジュラリティ', description: '参照の方向を使った有向 Q を、貪欲な群の結合で改善します。原論文のスペクトル法は実装していません。', paper: 'Leicht & Newman (2008)', url: 'https://arxiv.org/abs/0709.4500', fields: [] },
  { id: 'scc', label: '強連結成分（相互到達）', description: '参照をたどって互いに到達できる用語を同じ群にします。密度に基づく分類ではありません。', paper: 'Tarjan (1972)', url: 'https://doi.org/10.1137/0201010', fields: [] },
  { id: 'label', label: 'ラベル伝播', description: '無向の隣接関係で多数のラベルへ順次更新します。次数順で訪問し、同数なら現在のラベルを保ちます。最大100回。', paper: 'Raghavan et al. (2007)', url: 'https://arxiv.org/abs/0709.2938', fields: [] },
  { id: 'louvain', label: 'Louvain', description: '無向 Q が増えるようにノードを移し、群を集約して繰り返します。解像度1、訪問順と同点時の選択を固定。Leiden の改善は含みません。', paper: 'Blondel et al. (2008)', url: 'https://arxiv.org/abs/0803.0476', fields: [] },
  { id: 'spectral', label: 'スペクトル分類（Newman）', description: '無向モジュラリティ行列の最大固有値の固有ベクトルで再帰的に二分し、Q が増える分割だけを採用します。群数の指定と分割後の頂点移動は行いません。', paper: 'Newman (2006)', url: 'https://arxiv.org/abs/physics/0605087', fields: [] },
  { id: 'flow', label: '情報流（map equation）', description: '15%の一様テレポーテーションを記録する定常流を使い、2段階の符号長を貪欲な群の結合で短くします。公式 Infomap の探索や階層版ではありません。', paper: 'Rosvall & Bergstrom (2008)', url: 'https://arxiv.org/abs/0707.0609', fields: [] },
];
const spacing = () => [field('horizontal', '横方向の間隔', 1, .3, 3, .1), field('vertical', '縦方向の間隔', 1, .3, 3, .1)];
export const layoutMethods: Method<LayoutMethod>[] = [
  { id: 'grouped', label: '用語グループ別', description: '選択中の分類の群を並べ、群内は次数順に螺旋状に配置します。この方式だけ分類によって座標が変わります。', paper: '本プロジェクト独自の配置', fields: [field('within', 'グループ内の間隔', 1, .3, 2, .1), field('between', 'グループ間の間隔', 1, .5, 3, .1)] },
  { id: 'condensation', label: '強連結成分の階層', description: '強連結成分をまとめた DAG の最長路で層を決めます。各用語は個別に表示し、循環する矢印も保ちます。', paper: '強連結成分と DAG による独自の配置', fields: spacing() },
  { id: 'layered', label: '層状配置（Sugiyama 系）', description: 'DFS の戻り辺を計算内だけ反転し、最長路で層を決め、仮想ノードと重心法で順序を更新します。network simplex・スプライン最適化は含みません。', paper: 'Gansner et al. (1993)', url: 'https://graphviz.org/documentation/TSE93.pdf', fields: [...spacing(), field('sweeps', '並べ替え回数', 8, 0, 40)] },
  { id: 'force', label: '力学配置（Fruchterman–Reingold）', description: 'ノード間の反発と辺の引力で配置します。線形冷却を使い、弱連結成分ごとに計算します。', paper: 'Fruchterman & Reingold (1991)', url: 'https://reingold.co/force-directed.pdf', fields: [field('iterations', '反復回数', 250, 10, 500), field('repulsion', '反発の強さ', 1, .2, 3, .1), field('seed', '乱数シード', 42, 1, 9999)] },
  { id: 'stress', label: '距離ストレス', description: '無向最短路距離を目標とする重み付き stress majorization。重み付きラプラシアンの連立方程式を解き、ストレスを減らします。表示用の拡大前に評価し、大域最適解は保証しません。', paper: 'Gansner, Koren & North (2005; GD 2004)', url: 'https://doi.org/10.1007/978-3-540-31843-9_25', fields: [field('iterations', '反復回数の上限', 180, 10, 300), field('unit', '参照1回の距離', 90, 30, 200), field('seed', '乱数シード', 42, 1, 9999)] },
  { id: 'spectral', label: 'スペクトル配置（Laplacian）', description: '弱連結成分ごとに L = D − A の最小の非零固有値2個の固有ベクトルを座標にします。表示時は近接点を離します。重複固有値では軸は一意ではありません。', paper: 'Hall (1970)', url: 'https://doi.org/10.1287/mnsc.17.3.219', fields: spacing() },
  { id: 'radial', label: '放射状（BFS）', description: '弱連結成分ごとに次数最大の用語を中心にし、無向の参照距離ごとに同心円へ配置します。', paper: '本プロジェクト独自の配置', fields: spacing() },
  { id: 'circle', label: '円形（次数順）', description: '弱連結成分ごとに次数順で円周に並べます。線の交差や距離を最適化しません。', paper: '比較用の基準配置', fields: spacing() },
];

export function parameters(method: Method<string>, values: Record<string, number> = {}): Record<string, number> {
  const result: Record<string, number> = {};
  for (const field of method.fields) {
    const value = values[field.key] ?? field.value;
    if (!Number.isFinite(value) || value < field.min || value > field.max || field.step === 1 && !Number.isInteger(value)) throw Error(`計算条件が範囲外です：${field.label}`);
    result[field.key] = value;
  }
  return result;
}
