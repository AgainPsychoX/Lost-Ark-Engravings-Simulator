registerStrategy({
	name: "Naive ranges",
	description: "Naive strategy that tries use 65%+ for primary row, then 55% for secondary, and remaining for negative.",
	tags: ["built-in", "naive"],
	implementation: (rows, remaining, chance) => {
		if (0.65 <= chance) {
			return remainingInOrder(remaining, [0, 1, 2]);
		}
		if (0.55 <= chance) {
			return remainingInOrder(remaining, [1, 0, 2]);
		}
		return remainingInOrder(remaining, [2, 1, 0]);
	}
});
