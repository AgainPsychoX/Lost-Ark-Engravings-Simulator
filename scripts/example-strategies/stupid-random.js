registerStrategy({
	name: "Random",
	description: "Strategy selecting row randomly.",
	tags: ["built-in", "stupid"],
	implementation: (rows, remaining, chance) => {
		// https://stackoverflow.com/a/12646864/4880243
		function shuffleArray(array) {
			for (let i = array.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[array[i], array[j]] = [array[j], array[i]];
			}
		}
		
		return remainingInOrder(remaining, shuffleArray([0, 1, 2]));
	}
});
