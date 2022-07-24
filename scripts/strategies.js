
/**
 * @typedef StrategyMetadata
 * @property {string} name
 * @property {string} description
 * @property {string[]} [tags]
 * @property {string} [author]
 * @property {Date} [lastModified]
 */

/**
 * @param {stripToStrategyMetadata} x
 * @returns {StrategyMetadata}
 */
const stripToStrategyMetadata = x => {
	return {
		name: x.name,
		description: x.description,
		tags: x.tags,
		author: x.author,
		lastModified: x.lastModified,
	};
}

/**
 * Helper function to fix indents in code text.
 */
const tryFixIndents = (text) => {
	const parts = text.split('\n');
	const match = parts[parts.length - 1].match(/\S/);
	if (!match || match.index == 0) {
		return text;
	}
	return parts.map(p => p.substring(match.index)).join('\n');
}

/**
 * @typedef StrategyDefinitionOther
 * @property {string | Function} implementation
 */

/**
 * @typedef {StrategyMetadata & StrategyDefinitionOther} StrategyDefinition
 */

/**
 * @callback NextStepPromiseSupplier
 * @returns {Promise<void>}
 */

/**
 * Abstract class representing possible strategy.
 */
class AbstractStrategy {
	/**
	 * @param {StrategyMetadata} metadata 
	 */
	constructor(metadata) {
		/** @type {StrategyMetadata} */
		this.metadata = metadata;
		/** @type {HTMLElement} */
		this.html = null;

		// Make sure tags array exist at least empty
		if (!this.metadata.tags) {
			this.metadata.tags = [];
		}
	}

	/**
	 * Runs the strategy for given simulator instance.
	 * @param {AbstractSimulator} simulator 
	 * @param {NextStepPromiseSupplier>} [getStepPromise]
	 * @returns {SimulationState}
	 */
	async run(simulator, getStepPromise = () => undefined) {
		const runButton = this.html.querySelector('.controls button[name=run]');
		runButton.disabled = true;
		try {
			/** @type {SimulationState} */
			let state;
			/** @type {boolean | undefined} */
			let lastRoll = null;
			let counter = 0;
			while (true) {
				state = simulator.getState();
				if (state.finished) {
					break;
				}
				await getStepPromise();
				const selected = this.step(state, simulator.settings);
				lastRoll = simulator.advance(selected);
				console.debug(`Step ${++counter}. Advancing row ${selected}: ${lastRoll ? 'success' : 'failure'} (new chance: ${simulator.chance})`);
			}
			return state;
		}
		catch (e) {
			throw e;
		}
		finally {
			runButton.disabled = false;
		}
	}

	/**
	 * @abstract
	 * @param {SimulationState} state 
	 * @param {SimulationSettings} settings
	 * @returns {number} Selected in the step row index.
	 */
	step(state, settings) {}

	/**
	 * @abstract
	 * @param {HTMLElement} root
	 * @returns {DocumentFragment}
	 */
	getHTMLTemplate(root) {
		return root.querySelector(`template.strategy`).content;
	}

	/**
	 * @abstract
	 * @param {StrategiesManager} manager 
	 * @returns {DocumentFragment}
	 */
	prepareHTML(manager) {
		const fragment = this.getHTMLTemplate(manager.container).cloneNode(true);
		this.html = fragment.firstElementChild;

		// Populate name and description
		const nameElement = fragment.querySelector('h3');
		nameElement.innerText = this.metadata.name;
		const descriptionElement = fragment.querySelector('p');
		descriptionElement.innerHTML = this.metadata.description;

		// Setup controls
		fragment.querySelector('.controls button[name=run]').addEventListener('click', () => manager.runStrategy(this));
		fragment.querySelector('.controls button[name=benchmark]').addEventListener('click', () => {
			// TODO: benchmarking
		});
		// TODO: clone? share? remove?
		
		const isBuiltIn = this.metadata.tags.includes('built-in');
		fragment.querySelector('details').addEventListener('click', function () {
			// Allow editing if not built-in and opened
			nameElement.contentEditable = descriptionElement.contentEditable = !isBuiltIn && this.open;

			// Allow only one strategy details expanded at the time
			if (manager.settings.onlyOneExpanded) {
				manager.foldAllDetails(this);
			}

			// Make sure editors don't bug in details-summary block (see https://github.com/ajaxorg/ace/issues/4635)
			setTimeout(() => {
				if (this.open) {
					this.querySelectorAll('.editor').forEach(editorElement => {
						ace.edit(editorElement).renderer.onGutterResize();
					})
				}
			}, 33);
		});

		return fragment;
	}
}

/**
 * Wraps function in order to debounce (delays execution for at least given timeout from last fire attempt).
 * @param {Function} func Function to debounce.
 * @param {number} [timeout] Debouncing timeout. If not provided or 0, debouncing using `requestAnimationFrame` is used.
 * @returns {Function} Wrapped function.
 */
const debounce = function (func, timeout) {
	let handle;
	if (timeout) {
		return (...args) => {
			clearTimeout(handle);
			handle = setTimeout(() => func.apply(this, args), timeout);
		};
	}
	else {
		return (...args) => {
			window.cancelAnimationFrame(handle);
			handle = requestAnimationFrame(() => func.apply(this, args));
		}
	}
}

/**
 * Adapter for representing simple function defined strategy.
 */
class FunctionStrategyAdapter extends AbstractStrategy {
	/**
	 * @param {StrategyMetadata} metadata 
	 * @param {string | Function} codeOrFunction 
	 */
	constructor(metadata, codeOrFunction) {
		super(metadata);

		/**
		 * @type {string} Raw code of the function. Stored to avoid decompilation.
		 */
		this.code = '';

		switch (typeof codeOrFunction) {
			case 'function':
				this.code = this.decompile(codeOrFunction);
				break;
			case 'string':
				this.compiledFunction = this.compile(codeOrFunction);
				break;
			default:
				throw new Error('Code or function is required for FunctionStrategyAdapter');
		}
	}

	async run(simulator, getStepPromise) {
		this.compile(this.editor.getValue());
		return super.run(simulator, getStepPromise);
	}

	/**
	 * @override
	 * @param {SimulationState} state 
	 * @param {SimulationSettings} settings
	 * @returns {number} Selected in the step row index.
	 */
	step(state, settings) {
		return this.compiledFunction(state.rows, state.remaining, state.chance, settings);
	}

	getHTMLTemplate(root) {
		return root.querySelector(`template.strategy-with-editor`).content;
	}

	prepareHTML(manager) {
		const fragment = super.prepareHTML(manager);

		// Setup editor using ACE (https://ace.c9.io/)
		{
			const editorElement = fragment.querySelector('.editor');
			const dragBarElement = fragment.querySelector('.dragbar');
			// Bug workaround (`setTimeout` necessary, see https://github.com/ajaxorg/ace/issues/4634)
			setTimeout(() => {
				const langTools = ace.require('ace/ext/language_tools');
				const editor = ace.edit(editorElement, {
					mode: 'ace/mode/javascript',
					enableBasicAutocompletion: true,
					enableLiveAutocompletion: true,
				});
				editor.setOptions(manager.settings.editorOptions);
				this.editor = editor;
				editor.session.on('changeMode', (e, session) => {
					if (session.getMode().$id === 'ace/mode/javascript') {
						if (!!session.$worker) {
							session.$worker.send('setOptions', [{
								'esversion': 10,
							}]);
						}
					}
				});
				langTools.addCompleter({
					getCompletions: (editor, session, pos, prefix, callback) => {
						callback(null, StrategiesManager.API_KEYWORDS.map(word => {
							return {
								caption: word,
								value: word,
								meta: 'static',
							};
						}));
					}
				});
				editor.setValue(this.code, -1);

				dragBarElement.addEventListener('mousedown', mouseDownEvent => {
					mouseDownEvent.preventDefault();
					const initialHeight = editorElement.clientHeight;
					const mouseMoveListener = debounce(mouseMoveEvent => {
						const difference = mouseMoveEvent.clientY - mouseDownEvent.clientY;
						const resultHeight = initialHeight + difference;
						editorElement.style.height = resultHeight + 'px';
						editor.resize()
					});
					document.addEventListener('mousemove', mouseMoveListener);
					document.addEventListener('mouseup', mouseUpEvent => {
						mouseUpEvent.preventDefault();
						document.removeEventListener('mousemove', mouseMoveListener);
					}, {once: true});
				})
			}, 200);
		}

		return fragment;
	}

	/**
	 * Decompiles code to function body.
	 * @param {Function} func 
	 */
	decompile(func) {
		const text = func.toString().match(/^(?:\s*function)?.*\(.*\)(?:\s*=>)?\s*\{[ \t]*\r?\n?([^]*)(?=\})/)[1];
		const parts = text.split(/\r\n|\n|\r/);
		let indent = 0;
		for (let i = 0; i < parts.length; i++) {
			const m = parts[i].match(/\S/);
			if (!m) {
				// Empty line?
				continue;
			}
			if (m.index == 0) {
				// Common indent is 0
				return text;
			}
			indent = m.index;
		}
		return parts.map(p => p.substring(indent)).join('\n');
	}

	/**
	 * Compiles code into function for defining the strategy.
	 * @param {string} code 
	 */
	compile(code) {
		try {
			// TODO: detect whenever it's whole function or body.
			// code = code.trim();
			// if (code.startsWith('('))
			this.code = code;
			this.compiledFunction = new Function('rows', 'remaining', 'chance', 'settings', code);
		}
		catch (e) {
			// TODO: report errors to user
		}
	}
}

/**
 * Helper class for managing steps for step by step mode.
 */
class StepController {
	prepare(delay) {
		if (this._reject) {
			console.warn(`Preparing step controller before previous process was terminated.`);
		}
		this.terminate();
		this._drain = false;

		if (typeof delay === 'number') {
			this.setStepInterval(delay);
		}

		return () => {
			this._promise = new Promise((resolve, reject) => {
				if (this._drain) {
					resolve();
				}
				else {
					this._reject = reject;
					this._resolve = resolve;
				}
			});
			return this._promise;
		}
	}

	clearStepInterval() {
		globalThis.clearInterval(this._interval);
	}

	setStepInterval(delay) {
		this.clearStepInterval();
		this._interval = globalThis.setInterval(() => this.next(), delay);
		return this._interval;
	}

	changeStepInterval(delay) {
		this.clearStepInterval();
		this.setStepInterval(delay);
		return this._interval;
	}

	async terminate() {
		this.clearStepInterval();
		if (this._reject) {
			this._reject(new Error('process is being terminated'));
			this._reject = undefined;
		}
		if (this._promise) {
			return new Promise(resolve => this._promise.finally(() => {
				resolve();
				this._promise = undefined;
			}));
		}
		return Promise.resolve();
	}

	async next() {
		if (this._resolve) {
			this._resolve();
			this._resolve = undefined;
			this._reject = undefined;
		}
		return this._promise;
	}

	drain() {
		this._drain = true;
		this.next();
	}
}

/**
 * @callback RunStrategyCallback
 * @param {AbstractStrategy} strategy
 * @param {AbstractSimulator} simulator
 * @returns {Promise<void>}
 */

/**
 * @typedef StrategiesManagerSettings
 * @property {boolean} [onlyOneExpanded] Whenever only one strategies details tag can be expanded.
 * @property {number} [delay] Delay between step when running strategy on visual simulator.
 * @property {boolean} [stepByStep] Step by step mode. When true, user input is required to proceed to next steps.
 * @property {object} [editorOptions] Object of options for ACE editors.
 */

/**
 * Manager for the strategies, bridge between those and the simulator.
 */
class StrategiesManager {
	/** @type {StrategiesManagerSettings} */
	static DEFAULT_SETTINGS = {
		onlyOneExpanded: true,
		delay: 100,
		stepByStep: false,
		editorOptions: {},
	};

	/** 
	 * List of API-related keywords to autocomplete in editors.
	 * @type {string[]} 
	 */
	static API_KEYWORDS = [
		// Main function arguments
		'rows', 'remaining', 'chance', 'settings',
		// Helper functions
		'remainingInOrder',
	];

	/**
	 * @param {HTMLElement} container 
	 * @param {VisualSimulator} visualSimulator 
	 * @param {StrategiesManagerSettings} [settings]
	 */
	constructor(container, visualSimulator, settings = {}) {
		/** @type {HTMLElement} */
		this.container = container;
		/** @type {VisualSimulator} */
		this.visualSimulator = visualSimulator;
		/** @type {AbstractStrategy[]} */
		this.strategies = [];
		/** @type {StrategiesManagerSettings} */
		this.settings = Object.assign(Object.assign({}, StrategiesManager.DEFAULT_SETTINGS), settings);
		/** @type {StepController} */
		this.stepController = new StepController();
		/** @type {RunStrategyCallback | undefined} */
		this.onRunBegin = undefined;
		/** @type {RunStrategyCallback | undefined} */
		this.onRunEnd = undefined;
	}

	/**
	 * @param {RunStrategyCallback} callback 
	 */
	setOnRunBegin(callback) {
		this.onRunBegin = callback;
	}
	/**
	 * @param {RunStrategyCallback} callback 
	 */
	 onRunEnd(callback) {
		this.onRunBegin = callback;
	}

	/**
	 * @param {string} name 
	 * @returns {AbstractStrategy | null}
	 */
	findStrategyByName(name) {
		return this.strategies.find(s => s.metadata.name === name);
	}

	/**
	 * Adapts strategy definition to fullfil `AbstractStrategy` interface.
	 * @param {StrategyDefinition} strategy 
	 * @returns {AbstractStrategy}
	 */
	adaptStrategyDefinition(strategy) {
		return new FunctionStrategyAdapter(stripToStrategyMetadata(strategy), strategy.implementation);
	}

	/**
	 * Registers strategy for strategies manager.
	 * @param {StrategyDefinition | AbstractStrategy} strategy 
	 * @returns {void}
	 */
	registerStrategy(strategy) {
		const instance = strategy instanceof AbstractStrategy ? strategy : this.adaptStrategyDefinition(strategy);

		// Prevent repeating names
		if (this.strategies.find(s => s.metadata.name === instance.metadata.name)) {
			const suffixes = [' (new)', ' (other)', ' (better?)', ' (duplicate)']; // Could't decide ;)
			instance.metadata.name += suffixes[Math.floor(Math.random() * suffixes.length)];
			console.warn(`Registering strategy with the same name as other already registered! Renaming to '${instance.metadata.name}'.`);
		}

		// Add the strategy to the list
		this.strategies.push(instance);

		// Prepare HTML
		this.container.querySelector('ul.strategies').appendChild(instance.prepareHTML(this));
	}

	/**
	 * Runs provided strategy.
	 * @param {AbstractStrategy} instance 
	 */
	async runStrategy(instance) {
		this.visualSimulator.reset();
		if (this.onRunBegin) {
			await this.onRunBegin(instance, this.visualSimulator);
		}
		await instance.run(this.visualSimulator, this.stepController.prepare(this.settings.stepByStep ? undefined : this.settings.delay));
		await this.stepController.terminate();
		if (this.onRunEnd) {
			await this.onRunEnd(instance, this.visualSimulator);
		}
	}

	/**
	 * Folds details view for all strategies, except selected one.
	 * @param {HTMLDetailsElement} except 
	 */
	foldAllDetails(except) {
		this.container.querySelectorAll('details').forEach(details => {
			if (details == except) return;
			details.open = false;
		});
	}

	setStepByStepDelay(delay) {
		this.settings.delay = delay;
		this.stepController.changeStepInterval(delay);
	}
}


