export const placements = [
  {id:'grouped',label:'用語群別に配置',description:'同じ群を近くにまとめます。位置に方向や階層の意味はありません。',paper:'Clauset, Newman & Moore (2004)',url:'https://arxiv.org/abs/cond-mat/0408187'},
  {id:'condensation',label:'強連結成分の階層',description:'相互に到達できる用語を同じ層に置き、成分間の参照が上から下へ進むよう配置します。全ノードは展開したままです。帯と層番号は初期配置の層を示します。',paper:'Tarjan (1972)',url:'https://doi.org/10.1137/0201010'},
  {id:'layered',label:'Sugiyama 系の層状配置',description:'循環を配置計算の中だけで解消し、層を割り当てて交差を減らす順序を探します。描画する矢印は原典の方向を維持するため、上向きの戻り辺も残ります。',paper:'Sugiyama, Tagawa & Toda (1981); Gansner et al. (1993)',url:'https://graphviz.org/documentation/TSE93.pdf'},
  {id:'force',label:'力学配置（Fruchterman–Reingold）',description:'seed42の初期座標から、全ノード間の反発と隣接ノード間の引力を250回計算します。方向を無視した近さで配置し、矢印は元の方向を保ちます。弱連結成分ごとに計算して区画に詰めます。',paper:'Fruchterman & Reingold (1991)',url:'https://reingold.co/force-directed.pdf'},
  {id:'stress',label:'距離ストレス（反復緩和）',description:'無向最短路の長さに画面上の距離を近づけます。seed42・距離単位90・最大180回の重み付き反復緩和と直線探索で、Kamada–KawaiのNewton法や厳密なstress majorizationではありません。',paper:'Kamada & Kawai (1989); 関連説明：Fruchterman & Reingold (1991)',url:'https://reingold.co/force-directed.pdf'},
  {id:'radial',label:'放射状配置（BFS）',description:'弱連結成分ごとに次数が最大の用語を中心にし、無向の参照距離ごとに同心円へ配置します。中心からの距離はホップ数を表し、学習順序ではありません。独自のBFS配置です。',paper:'比較用の独自アルゴリズム'},
  {id:'circle',label:'円形配置（次数順）',description:'弱連結成分ごとに用語を次数順で円周に並べます。交差や階層を最適化せず、他方式の比較基準にします。',paper:'比較用の独自アルゴリズム'}
];
export const communityMethods = [
  {id:'undirected',label:'無向モジュラリティ',description:'参照方向を無視し、内部の結び付きが次数から期待される量より密な群を探します。従来の表示との比較基準です。',paper:'Clauset, Newman & Moore (2004)',url:'https://arxiv.org/abs/cond-mat/0408187'},
  {id:'directed',label:'有向モジュラリティ',description:'参照元の出次数と参照先の入次数を使う Q を最大化します。同じ無向構造でも方向によって群が変わります。論文のスペクトル法ではなく、決定的な貪欲結合で近似します。',paper:'Leicht & Newman (2008)',url:'https://arxiv.org/abs/0709.4500'},
  {id:'scc',label:'強連結成分（相互到達）',description:'参照をたどって互いに到達できる用語を厳密に分割します。密度に基づくコミュニティではありません。長い循環で大きな群になる場合があります。',paper:'Tarjan (1972)',url:'https://doi.org/10.1137/0201010'},
  {id:'label',label:'ラベル伝播（無向）',description:'隣接用語の多数ラベルを繰り返し伝播します。方向を無視し、次数順・同数なら現在のラベルを維持する決定的な簡略版です。密度Qを直接最適化しないため、巨大な群になる場合があります。',paper:'Raghavan, Albert & Kumara (2007)',url:'https://arxiv.org/abs/0709.2938'},
  {id:'louvain',label:'Louvain（無向・多段集約）',description:'無向Qが増えるよう用語を隣の群へ移し、その群を一つの頂点に集約して繰り返します。解像度1、順序と同数時の選択を固定した実装です。Leidenの精緻化は含みません。',paper:'Blondel et al. (2008)',url:'https://arxiv.org/abs/0803.0476'},
  {id:'flow',label:'情報流（map equation・貪欲）',description:'有向ランダムウォークの2段符号長を減らす群を探します。テレポーテーション15%を記録し、全群ペアの貪欲結合で最適化します。公式Infomapや階層Infomapの探索器とは異なる簡略実装です。',paper:'Rosvall & Bergstrom (2008)',url:'https://arxiv.org/abs/0707.0609'}
];
export const furtherMethods = [
  {label:'階層 Infomap・公式探索器',description:'有向ランダムウォークの情報流を短い符号で表現する群を探します。密度とは異なる分割を得られ、階層版では複数の深さを扱います。階層版と公式探索器は未実装です。',paper:'Rosvall & Bergstrom (2008, 2011)',url:'https://arxiv.org/abs/0707.0609',secondUrl:'https://doi.org/10.1371/journal.pone.0018209'},
  {label:'Leiden',description:'局所移動と群の集約を繰り返して、多尺度の密度コミュニティを求めます。Leiden は分割を精緻化し、群の連結性を改善します。有向版・目的関数・解像度の選択が必要です。Leiden の精緻化は未実装です。',paper:'Blondel et al. (2008); Traag et al. (2019)',url:'https://arxiv.org/abs/0803.0476',secondUrl:'https://arxiv.org/abs/1810.08473'}
];
