// PARITY ORACLE: NOT IMPORTED BY THE PIPELINE.
//
// `averageLinkageClusters` exactly as it ran from 11 Sep to 18 Nov 2026
// (lib/pipeline/cluster.ts at 1cea2113), with its `cosine`, copied VERBATIM
// apart from the names. The 18 Nov speed change (normalisers computed once,
// the matrix held as its upper triangle, several pairs per pass) is meant to
// change nothing: on every input it must give these clusters, in this order,
// bit for bit. lib/pipeline/cluster.test.ts holds the two to that on synthetic
// corpora; scripts/cluster-bench.ts on the real ones. Do not "improve" this
// copy: a difference between the two is a bug in the new one.

export function cosineV1(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** The 11 Sep fill on its own (the first loop of `averageLinkageClustersV1`),
 *  so the benchmark can time the fill apart from the linkage. */
export function similarityMatrixV1(vecs: number[][]): Float64Array {
  const n = vecs.length
  const sim = new Float64Array(n * n)
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const s = cosineV1(vecs[a], vecs[b])
      sim[a * n + b] = s
      sim[b * n + a] = s
    }
  }
  return sim
}

export function averageLinkageClustersV1(vecs: number[][], threshold: number): number[][] {
  const n = vecs.length
  if (n === 0) return []

  // sim[a * n + b] = average cross-pair similarity between clusters a and b.
  // Flat and Float64 so a 2283-insight bucket is one 42MB buffer, not 2283
  // heap arrays. Only indices flagged active are meaningful.
  const sim = new Float64Array(n * n)
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const s = cosineV1(vecs[a], vecs[b])
      sim[a * n + b] = s
      sim[b * n + a] = s
    }
  }

  const members: number[][] = vecs.map((_, i) => [i])
  const size = new Int32Array(n).fill(1)
  const active = new Uint8Array(n).fill(1)
  const done: number[][] = []
  const chain: number[] = []
  let remaining = n

  while (remaining > 0) {
    if (chain.length === 0) {
      let start = 0
      while (!active[start]) start++
      chain.push(start)
    }
    const a = chain[chain.length - 1]

    // Nearest active neighbour of the chain's head. Ties go to the lowest
    // index — a fixed rule, so the chain cannot cycle between equal pairs.
    let best = -1
    let bestSim = -Infinity
    const rowA = a * n
    for (let b = 0; b < n; b++) {
      if (b === a || !active[b]) continue
      const s = sim[rowA + b]
      if (s > bestSim) {
        bestSim = s
        best = b
      }
    }
    if (best < 0) {
      // Last cluster standing.
      active[a] = 0
      remaining--
      done.push(members[a])
      chain.pop()
      continue
    }
    if (chain.length < 2 || chain[chain.length - 2] !== best) {
      chain.push(best)
      continue
    }

    // a and best are reciprocal nearest neighbours: merge or retire the pair.
    chain.pop()
    chain.pop()
    if (bestSim < threshold) {
      active[a] = 0
      active[best] = 0
      remaining -= 2
      done.push(members[a], members[best])
      continue
    }
    // Merge `best` into `a`; update average similarity by size-weighted mean.
    const sizeA = size[a]
    const sizeB = size[best]
    const rowB = best * n
    for (let c = 0; c < n; c++) {
      if (c === a || c === best || !active[c]) continue
      const s = (sizeA * sim[rowA + c] + sizeB * sim[rowB + c]) / (sizeA + sizeB)
      sim[rowA + c] = s
      sim[c * n + a] = s
    }
    members[a] = members[a].concat(members[best])
    size[a] = sizeA + sizeB
    active[best] = 0
    remaining--
  }

  for (const g of done) g.sort((x, y) => x - y)
  return done.sort((x, y) => x[0] - y[0])
}
