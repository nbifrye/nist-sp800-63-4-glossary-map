export const placements = [
  {id:'grouped',label:'用語グループ別に配置',description:'同じグループの用語を近くにまとめます。位置は参照の方向や階層を表しません。',paper:'Clauset, Newman & Moore (2004)',url:'https://arxiv.org/abs/cond-mat/0408187'},
  {id:'condensation',label:'強連結成分の階層',description:'参照をたどって互いに到達できる用語を同じ層に置きます。成分間の参照は、初期配置では上から下へ進みます。用語はまとめずに個別に表示し、帯と層番号で所属する層を示します。',paper:'Tarjan (1972)',url:'https://doi.org/10.1137/0201010'},
  {id:'layered',label:'Sugiyama 系の層状配置',description:'計算中だけ参照の循環を解消して層を割り当て、線の交差を減らす並び順を探します。画面の矢印は元の方向で描くため、上向きの参照も残ります。',paper:'Sugiyama, Tagawa & Toda (1981); Gansner et al. (1993)',url:'https://graphviz.org/documentation/TSE93.pdf'},
  {id:'force',label:'力学配置（Fruchterman–Reingold）',description:'用語どうしの反発と、参照でつながる用語どうしの引力から位置を求めます。初期配置は乱数シード42から250回計算した結果です。参照の方向を区別せず、つながった用語のまとまりごとに計算して配置します。矢印の方向は保ちます。',paper:'Fruchterman & Reingold (1991)',url:'https://reingold.co/force-directed.pdf'},
  {id:'stress',label:'距離ストレス（反復緩和）',description:'参照をたどる最短経路の長さに、画面上の用語間の距離を近づけます。参照の方向は区別しません。初期配置は乱数シード42、距離単位90、最大180回の重み付き反復緩和と直線探索で求めます。Kamada–KawaiのNewton法や厳密なstress majorizationは実装していません。',paper:'Kamada & Kawai (1989); 関連説明：Fruchterman & Reingold (1991)',url:'https://reingold.co/force-directed.pdf'},
  {id:'radial',label:'放射状配置（BFS）',description:'つながった用語のまとまりごとに、参照でつながる用語が最も多いものを中心にします。参照の方向を区別せず、中心から何回参照をたどるかに応じて同心円上に配置します。学習順序を表すものではありません。',paper:'比較のための独自の配置方法'},
  {id:'circle',label:'円形配置（次数順）',description:'つながった用語のまとまりごとに、参照でつながる用語の数の順に円周上へ並べます。線の交差や階層は調整せず、他の配置方法と比較するために使います。',paper:'比較のための独自の配置方法'}
];
export const communityMethods = [
  {id:'undirected',label:'無向モジュラリティ',description:'参照の方向を区別せず、用語どうしの結び付きが、つながる用語の数から期待されるよりも密なグループを探します。',paper:'Clauset, Newman & Moore (2004)',url:'https://arxiv.org/abs/cond-mat/0408187'},
  {id:'directed',label:'有向モジュラリティ',description:'参照する用語の数と、参照される用語の数を考慮してグループを探します。同じ用語間のつながりでも、方向によって結果が変わります。論文のスペクトル法は使わず、モジュラリティが増えるグループの結合を繰り返します。',paper:'Leicht & Newman (2008)',url:'https://arxiv.org/abs/0709.4500'},
  {id:'scc',label:'強連結成分（相互到達）',description:'参照をたどって互いに到達できる用語を同じグループにします。結び付きの密度ではなく、参照の経路による厳密な分類です。長い循環があると大きなグループになる場合があります。',paper:'Tarjan (1972)',url:'https://doi.org/10.1137/0201010'},
  {id:'label',label:'ラベル伝播（無向）',description:'隣接する用語で最も多いラベルに揃える処理を繰り返します。参照の方向を区別せず、次数順で更新し、同数なら現在のラベルを保ちます。モジュラリティを直接最大化する方法ではなく、大きなグループに偏る場合があります。',paper:'Raghavan, Albert & Kumara (2007)',url:'https://arxiv.org/abs/0709.2938'},
  {id:'louvain',label:'Louvain（無向・多段集約）',description:'無向モジュラリティが増えるように用語を隣のグループへ移し、グループを1つの頂点にまとめて処理を繰り返します。解像度は1で、処理順と同点時の選択を固定しています。Leidenによる分割の改善は実装していません。',paper:'Blondel et al. (2008)',url:'https://arxiv.org/abs/0803.0476'},
  {id:'flow',label:'情報流（map equation・貪欲法）',description:'参照の方向に沿ったランダムな移動を、短い符号で表せるグループを探します。全用語へ一様に移動する確率を15%とし、その移動も符号化します。2段階のmap equationを使い、符号長が減るグループの結合を繰り返します。公式Infomapの探索処理や階層版は実装していません。',paper:'Rosvall & Bergstrom (2008)',url:'https://arxiv.org/abs/0707.0609'}
];
export const furtherMethods = [
  {label:'階層 Infomap・公式の探索処理',description:'ランダムな移動を短い符号で表すグループを探す方法です。階層版では複数の深さのグループを扱います。階層版と公式の探索処理は実装していません。',paper:'Rosvall & Bergstrom (2008, 2011)',url:'https://arxiv.org/abs/0707.0609',secondUrl:'https://doi.org/10.1371/journal.pone.0018209'},
  {label:'Leiden',description:'Louvainの分割を改善し、グループ内部のつながりを強める方法です。適用には参照の方向の扱い、目的関数、解像度の選択が必要です。本プロジェクトでは実装していません。',paper:'Blondel et al. (2008); Traag et al. (2019)',url:'https://arxiv.org/abs/0803.0476',secondUrl:'https://arxiv.org/abs/1810.08473'}
];
