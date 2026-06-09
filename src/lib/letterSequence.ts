// Shared letter-sequence utilities used by next-letters and save routes

// Convert 0-based index → letter sequence:
// 0→['a'] … 25→['z'], 26→['a','a'] … 701→['z','z'], 702→['a','a','a'] …
export function indexToLetters(n: number): string[] {
  if (n < 26) return [String.fromCharCode(97 + n)]
  n -= 26
  if (n < 26 * 26) {
    return [
      String.fromCharCode(97 + Math.floor(n / 26)),
      String.fromCharCode(97 + (n % 26)),
    ]
  }
  n -= 26 * 26
  return [
    String.fromCharCode(97 + Math.floor(n / (26 * 26))),
    String.fromCharCode(97 + Math.floor((n % (26 * 26)) / 26)),
    String.fromCharCode(97 + (n % 26)),
  ]
}

export function lettersToIndex(letters: string[]): number {
  if (letters.length === 1) return letters[0].charCodeAt(0) - 97
  if (letters.length === 2) {
    return 26 + (letters[0].charCodeAt(0) - 97) * 26 + (letters[1].charCodeAt(0) - 97)
  }
  return (
    26 + 676 +
    (letters[0].charCodeAt(0) - 97) * 676 +
    (letters[1].charCodeAt(0) - 97) * 26 +
    (letters[2].charCodeAt(0) - 97)
  )
}

/**
 * Given the name of the number folder (e.g. "UN_S_053") and a list of all
 * existing folder names inside it, return the next available variant letters
 * and full variant folder name.
 */
export function getNextLettersFromFolderNames(
  numberFolderName: string,
  existingFolderNames: string[],
): { letters: string[]; variantFolderName: string } {
  let maxIndex = -1
  const prefix = numberFolderName + '_'

  for (const name of existingFolderNames) {
    if (!name.startsWith(prefix)) continue
    const suffix = name.slice(prefix.length)
    const parts = suffix.split('_')
    if (
      parts.length >= 1 &&
      parts.length <= 3 &&
      parts.every(p => p.length === 1 && p >= 'a' && p <= 'z')
    ) {
      const idx = lettersToIndex(parts)
      if (idx > maxIndex) maxIndex = idx
    }
  }

  const letters = indexToLetters(maxIndex + 1)
  return {
    letters,
    variantFolderName: `${numberFolderName}_${letters.join('_')}`,
  }
}
