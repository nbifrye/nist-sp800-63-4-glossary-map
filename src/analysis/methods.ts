export type ClusteringMethod = 'undirected' | 'directed' | 'scc' | 'label' | 'louvain' | 'flow' | 'spectral';
export type LayoutMethod = 'grouped' | 'condensation' | 'layered' | 'force' | 'stress' | 'radial' | 'circle' | 'spectral';
export interface Field { key: string; label: string; value: number; min: number; max: number; step: number }
export interface Method<Id extends string> { id: Id; label: string; description: string; paper: string; url?: string; fields: Field[] }
const field = (key: string, label: string, value: number, min: number, max: number, step = 1): Field => ({ key, label, value, min, max, step });
export const clusteringMethods: Method<ClusteringMethod>[] = [
  { id: 'undirected', label: '無向モジュラリティ', description: '参照の方向と重複を取り除き、無向モジュラリティ Q が増えるようにグループを繰り返し結合します。', paper: 'Clauset, Newman & Moore (2004)', url: 'https://arxiv.org/abs/cond-mat/0408187', fields: [] },
  { id: 'directed', label: '有向モジュラリティ', description: '参照の方向を考慮し、有向モジュラリティ Q の増加量が最も大きいグループどうしを順に結合します。原論文のスペクトル法は実装していません。', paper: 'Leicht & Newman (2008)', url: 'https://arxiv.org/abs/0709.4500', fields: [] },
  { id: 'scc', label: '強連結成分（相互到達）', description: '矢印の向きに沿って参照をたどり、互いに行き来できる用語を同じグループにまとめます。', paper: 'Tarjan (1972)', url: 'https://doi.org/10.1137/0201010', fields: [] },
  { id: 'label', label: 'ラベル伝播', description: '参照の方向を取り除き、隣接する用語で最も多いラベルに順次更新します。次数順に処理し、同数の場合は現在のラベルを保ちます。更新は最大100回繰り返します。', paper: 'Raghavan et al. (2007)', url: 'https://arxiv.org/abs/0709.2938', fields: [] },
  { id: 'louvain', label: 'Louvain', description: '無向モジュラリティ Q が増えるように用語の所属を変え、グループをまとめて同じ処理を繰り返します。解像度は1とし、処理順と同点の場合の選択を固定します。Leiden による改善は含みません。', paper: 'Blondel et al. (2008)', url: 'https://arxiv.org/abs/0803.0476', fields: [] },
  { id: 'spectral', label: 'スペクトル分類（Newman）', description: '無向モジュラリティ行列の最大固有値に対応する固有ベクトルを使い、グループを繰り返し二分します。Q が増える分割を採用します。グループ数は指定せず、分割後の頂点の移動は行いません。', paper: 'Newman (2006)', url: 'https://arxiv.org/abs/physics/0605087', fields: [] },
  { id: 'flow', label: '情報流（map equation）', description: '15%の確率で全用語のいずれかへ一様に移る動きも含めて、定常状態の流れを求めます。2段階の符号長が最も短くなるグループどうしを順に結合します。公式 Infomap の探索処理や階層版は実装していません。', paper: 'Rosvall & Bergstrom (2008)', url: 'https://arxiv.org/abs/0707.0609', fields: [] },
];
const spacing = () => [field('horizontal', '横方向の間隔', 1, .3, 3, .1), field('vertical', '縦方向の間隔', 1, .3, 3, .1)];
export const layoutMethods: Method<LayoutMethod>[] = [
  { id: 'grouped', label: '用語グループ別', description: '選択中の分類に従ってグループを並べ、各グループ内の用語を次数順にらせん状に配置します。分類を変えると、座標も変わります。', paper: '本プロジェクト独自の配置', fields: [field('within', 'グループ内の間隔', 1, .3, 2, .1), field('between', 'グループ間の間隔', 1, .5, 3, .1)] },
  { id: 'condensation', label: '強連結成分の階層', description: '強連結成分を1つずつの点にまとめた有向非巡回グラフ（DAG）を使い、最長経路に基づいて層を決めます。成分の並び順は層状配置と同じ中央値法と隣接交換で調整します。画面には各用語と循環する参照も表示します。', paper: '強連結成分と DAG による独自の配置', fields: [...spacing(), field('sweeps', '並べ替え回数', 24, 0, 40)] },
  { id: 'layered', label: '層状配置（Sugiyama 系）', description: '強連結成分の中で Eades–Lin–Smyth の貪欲法が選んだ参照の向きを計算中だけ反転し、network simplex で辺の長さの合計が最小になるように層を決めます。仮想ノードを置き、中央値法と隣接交換で交差の少ない並び順を残します。横方向の座標の最適化とスプラインは実装していません。', paper: 'Gansner et al. (1993)', url: 'https://graphviz.org/documentation/TSE93.pdf', fields: [...spacing(), field('sweeps', '並べ替え回数', 24, 0, 40)] },
  { id: 'force', label: '力学配置（Fruchterman–Reingold）', description: '用語どうしの反発力と、参照で結ばれた用語どうしの引力を使って配置します。弱連結成分ごとに計算し、移動量の上限を一定の割合で減らします。', paper: 'Fruchterman & Reingold (1991)', url: 'https://reingold.co/force-directed.pdf', fields: [field('iterations', '反復回数', 250, 10, 500), field('repulsion', '反発の強さ', 1, .2, 3, .1), field('seed', '乱数シード', 42, 1, 9999)] },
  { id: 'stress', label: '距離ストレス', description: '参照の方向を取り除いた最短経路の長さに、用語間の距離を近づけます。重み付き stress majorization を使い、ラプラシアンの連立方程式を解いて誤差を減らします。指標は表示用に拡大する前に評価します。大域的な最適解は保証しません。', paper: 'Gansner, Koren & North (2005; GD 2004)', url: 'https://doi.org/10.1007/978-3-540-31843-9_25', fields: [field('iterations', '反復回数の上限', 180, 10, 300), field('unit', '参照1段階あたりの距離', 90, 30, 200), field('seed', '乱数シード', 42, 1, 9999)] },
  { id: 'spectral', label: 'スペクトル配置（Laplacian）', description: '弱連結成分ごとに、L = D − A の0以外の固有値を小さい順に2つ選び、対応する固有ベクトルを座標に使います。表示時には近接した点を離します。固有値が重複する場合、軸の選び方は一意に決まりません。', paper: 'Hall (1970)', url: 'https://doi.org/10.1287/mnsc.17.3.219', fields: spacing() },
  { id: 'radial', label: '放射状（BFS）', description: '弱連結成分ごとに、参照で結ばれた相手が最も多い用語を中心に置きます。参照の方向を取り除いて中心からの最短経路を求め、その長さに応じて同心円上に配置します。', paper: '本プロジェクト独自の配置', fields: spacing() },
  { id: 'circle', label: '円形（次数順）', description: '弱連結成分ごとに、用語を次数順に円周上へ並べます。ほかの配置方法と比較するための基準として使えます。', paper: '比較用の基準配置', fields: spacing() },
];

export function parameters(method: Method<string>, values: Record<string, number> = {}): Record<string, number> {
  const result: Record<string, number> = {};
  for (const field of method.fields) {
    const value = values[field.key] ?? field.value;
    if (!Number.isFinite(value) || value < field.min || value > field.max || field.step === 1 && !Number.isInteger(value)) throw Error(`計算条件の値が範囲外です：${field.label}`);
    result[field.key] = value;
  }
  return result;
}
