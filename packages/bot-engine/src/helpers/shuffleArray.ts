/** Fisher-Yates shuffle returning a new array. `random` is injectable for tests. */
export const shuffleArray = <T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] => {
  const shuffledItems = [...items];
  for (let index = shuffledItems.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    const currentItem = shuffledItems[index]!;
    shuffledItems[index] = shuffledItems[swapIndex]!;
    shuffledItems[swapIndex] = currentItem;
  }
  return shuffledItems;
};
