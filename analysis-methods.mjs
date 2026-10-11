export const placements = [
  {id:'grouped',label:'用語群別に配置',description:'同じ群を近くにまとめます。位置に方向や階層の意味はありません。',paper:'Clauset, Newman & Moore (2004)',url:'https://arxiv.org/abs/cond-mat/0408187'},
  {id:'condensation',label:'強連結成分の階層',description:'相互に到達できる用語を同じ層に置き、成分間の参照が上から下へ進むよう配置します。全ノードは展開したままです。帯と層番号は初期配置の層を示します。',paper:'Tarjan (1972)',url:'https://doi.org/10.1137/0201010'},
  {id:'layered',label:'Sugiyama 系の層状配置',description:'循環を配置計算の中だけで解消し、層を割り当てて交差を減らす順序を探します。描画する矢印は原典の方向を維持するため、上向きの戻り辺も残ります。',paper:'Sugiyama, Tagawa & Toda (1981); Gansner et al. (1993)',url:'https://graphviz.org/documentation/TSE93.pdf'}
];
export const communityMethods = [
  {id:'undirected',label:'無向モジュラリティ',description:'参照方向を無視し、内部の結び付きが次数から期待される量より密な群を探します。従来の表示との比較基準です。',paper:'Clauset, Newman & Moore (2004)',url:'https://arxiv.org/abs/cond-mat/0408187'},
  {id:'directed',label:'有向モジュラリティ',description:'参照元の出次数と参照先の入次数を使う Q を最大化します。同じ無向構造でも方向によって群が変わります。論文のスペクトル法ではなく、決定的な貪欲結合で近似します。',paper:'Leicht & Newman (2008)',url:'https://arxiv.org/abs/0709.4500'},
  {id:'scc',label:'強連結成分（相互到達）',description:'参照をたどって互いに到達できる用語を厳密に分割します。密度に基づくコミュニティではありません。長い循環で大きな群になる場合があります。',paper:'Tarjan (1972)',url:'https://doi.org/10.1137/0201010'}
];
export const furtherMethods = [
  {label:'Infomap・階層 Infomap',description:'有向ランダムウォークの情報流を短い符号で表現する群を探します。密度とは異なる分割を得られ、階層版では複数の深さを扱います。今回の実装対象外です。',paper:'Rosvall & Bergstrom (2008, 2011)',url:'https://arxiv.org/abs/0707.0609',secondUrl:'https://doi.org/10.1371/journal.pone.0018209'},
  {label:'Louvain / Leiden',description:'局所移動と群の集約を繰り返して、多尺度の密度コミュニティを求めます。Leiden は分割を精緻化し、群の連結性を改善します。有向版・目的関数・解像度の選択が必要です。今回の実装対象外です。',paper:'Blondel et al. (2008); Traag et al. (2019)',url:'https://arxiv.org/abs/0803.0476',secondUrl:'https://arxiv.org/abs/1810.08473'}
];
