export function cosineSimilarity(queryVector: number[], queryMagnitude: number, vector: number[]): number {
  const comparisonMagnitude = vectorMagnitude(vector);
  if (!Number.isFinite(comparisonMagnitude) || comparisonMagnitude <= 0) return Number.NaN;

  let dotProduct = 0;
  for (let index = 0; index < queryVector.length; index += 1) {
    dotProduct += queryVector[index]! * vector[index]!;
  }

  return dotProduct / (queryMagnitude * comparisonMagnitude);
}

export function vectorMagnitude(vector: number[]): number {
  if (vector.length === 0) return 0;

  let sum = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) return Number.NaN;
    sum += value * value;
  }

  return Math.sqrt(sum);
}

export function validPositiveInteger(value: number | undefined): number | null {
  return Number.isInteger(value) && value! > 0 ? value! : null;
}
