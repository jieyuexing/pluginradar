// 测试共用：种子化伪随机数（mulberry32）与生成式循环。种子默认固定，可用环境变量 TEST_SEED 覆盖以复跑或扩大搜索。
export const SEED = Number(process.env.TEST_SEED ?? 20261125) >>> 0;

export function rng(seed = SEED) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = (list) => list[int(0, list.length - 1)];
  const bool = (p = 0.5) => next() < p;
  const shuffle = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return { next, int, pick, bool, shuffle };
}

// 跑 runs 轮生成式检查；某轮抛错时把种子、轮次和样本附进错误信息，便于缩成固定用例。
export function forAll(runs, gen, prop, seed = SEED) {
  const r = rng(seed);
  for (let i = 0; i < runs; i += 1) {
    const sample = gen(r, i);
    try {
      prop(sample, i);
    } catch (e) {
      throw new Error(`TEST_SEED=${seed} 第 ${i} 轮失败：${e.message}\n样本：${JSON.stringify(sample, null, 2).slice(0, 2000)}`, { cause: e });
    }
  }
}

export const clone = (v) => structuredClone(v);
