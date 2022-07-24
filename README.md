
**Note**
> Someone already done it better: https://myar.tistory.com/26. 
> 
> Seems like perfect strategy exists, no point in coding tool to find it...

---

# Lost Ark Engravings Simulator

Lost Ark game has engravings systems which can enhance your gear and stats. My goal is to create tool to aid players while creating those items, as there is special mini-game/mechanics introduced to make this progress more interesting.

![screenshot](docs/1.png)

### Features

+ Simulator, working mini-game.
+ Keyboard support (`1`, `2`, `3` + `R`).
+ Strategies, via editable code snippets.

### TODO

+ Show busy, lock controls.
+ Built-in strategies.
+ 'Add strategy' button.
+ Show errors to user without DevTools.
+ Benchmarking, scoring, sorting
	+ ...
	+ Auto-extend last used strategy details.
+ Share strategies via link (query string?).
	+ ...
+ Editor:
	+ Share settings between all editors.
	+ Save/load settings (see https://gist.github.com/FWDekker/364585d7eee2cc5ac690a8276aaab62b).
	+ Beautifying?
+ Show and allow editing strategies author and tags.
+ Animated `<details>` tags (see https://css-tricks.com/how-to-animate-the-details-element/)
+ Add `FastSimulator` for Rust WebAssembly?


