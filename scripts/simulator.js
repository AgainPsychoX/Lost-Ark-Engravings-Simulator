
/**
 * @typedef RowDefinition
 * @property {string} name
 * @property {number} steps
 */

/**
 * @callback ChanceMutator
 * @param {number} chance
 * @param {boolean} isSuccess
 * @param {RowDefinition} row
 * @returns {number}
 */

/**
 * @typedef SimulationSettings
 * @property {RowDefinition[]} [rows]
 * @property {number} [initialChance]
 * @property {number} [minimalChance]
 * @property {number} [maximalChance]
 * @property {number} [successChanceChange]
 * @property {number} [failureChanceChange]
 */

/**
 * @typedef {(boolean | null)[]} RowState
 */

/**
 * @typedef SimulationState
 * @property {RowState[]} rows
 * @property {number} remaining
 * @property {number} chance
 */

/**
 * Helper function to keep value in certain range.
 * @param {number} min Range start, minimal return value.
 * @param {number} max Range end, maximal return value.
 * @param {number} val Value to be clamped by the range.
 * @returns {number} Clamped value.
 */
const _clamp = (min, max, val) => Math.min(max, Math.max(min, val));

const _round = num => Math.round((num + Number.EPSILON) * 10000) / 10000;

/**
 * Abstract class for the engravings rolling simulator.
 */
class AbstractSimulator {
	/** @type {SimulationSettings} */
	static DEFAULT_SETTINGS = {
		rows: [
			{name: 'primary', steps: 10},
			{name: 'secondary', steps: 10},
			{name: 'negative', steps: 10},
		],
		initialChance: 0.75,
		minimalChance: 0.25,
		maximalChance: 0.75,
		successChanceChange: -0.1,
		failureChanceChange: 0.1,
	};
	
	/**
	 * @param {SimulationSettings} settings 
	 */
	constructor(settings) {
		/** @type {SimulationSettings} */
		this.settings = Object.assign(Object.assign({}, AbstractSimulator.DEFAULT_SETTINGS), settings);
	}

	/**
	 * Resets the simulation state.
	 * @abstract
	 */
	reset() {
		this.chance = this.settings.initialChance;
	}

	/**
	 * Prepares the simulation to be ready to use.
	 * @abstract
	 */
	prepare() {
		this.reset();
	}

	/**
	 * Gets state of the simulation for selected row.
	 * @abstract
	 * @param {number} rowIndex Index of selected row.
	 * @returns {RowState}
	 */
	getRowState(rowIndex) {}

	/**
	 * Prepares object that summarizes simulation state.
	 * @abstract
	 * @returns {SimulationState}
	 */
	getState() {
		const rows = [...Array(this.settings.rows.length)].map((_, i) => this.getRowState(i));
		const remaining = rows.map((row, i)=> {
			const next = row.findIndex(v => v == null);
			if (next <= -1 || row.length <= next) {
				return 0;
			}
			return this.settings.rows[i].steps - next;
		});
		const remainingAll = remaining.reduce((prev, curr) => prev + curr);
		return {
			chance: this.chance,
			rows,
			remaining,
			remainingAll,
			finished: remainingAll == 0,
		};
	}

	/**
	 * Rolls result and updates chance.
	 * @abstract
	 * @returns {boolean}
	 */
	roll(rowIndex) {
		const success = Math.random() < this.chance;
		this.chance = _round(_clamp(
			this.settings.minimalChance,
			this.settings.maximalChance,
			this.chance + (success 
				? this.settings.successChanceChange 
				: this.settings.failureChanceChange
			)
		));
		return success;
	}

	/**
	 * Advances state of the simulation, rolling in selected row.
	 * @abstract
	 * @param {number} rowIndex Index of selected row.
	 * @returns {boolean} Returns true if roll was successful, false otherwise.
	 */
	advance(rowIndex) {}
}

/**
 * Visual implementation for the engravings rolling simulator, controlling related HTML parts to visually present user "the experience".
 */
class VisualSimulator extends AbstractSimulator {
	/**
	 * @param {HTMLElement} container 
	 * @param {SimulationSettings} settings 
	 */
	constructor(container, settings) {
		super(settings);

		/** @type {HTMLElement} */
		this.container = container;

		this.container.querySelector('button[name=reset]').addEventListener('click', () => this.reset());
	}

	updateStatus() {
		this.container.querySelector('output[name=chance]').innerText = (this.chance * 100).toFixed() + '%';
	}

	reset() {
		super.reset();
		const rowsElement = this.container.querySelector('.rows');
		const rowTemplate = this.container.querySelector('template.row').content;
		const cellTemplate = this.container.querySelector('template.cell').content;
		rowsElement.replaceChildren([]);
		let index = 0;
		for (const rowDefinition of this.settings.rows) {
			const rowIndex = index;
			const fragment = rowTemplate.cloneNode(true);
			const row = fragment.querySelector('.row');
			const cells = row.querySelector('.cells');
			const button = row.querySelector('button');
			row.dataset.maxSteps = rowDefinition.steps;
			row.dataset.lastStep = 0;
			button.addEventListener('click', () => {
				try {
					this.advance(rowIndex)
				}
				catch (e) {
					// Silent ignore.
				}
			});
			row.classList.add(rowDefinition.name);
			for (let i = 0; i < rowDefinition.steps; i++) {
				const fragment = cellTemplate.cloneNode(true);
				const cell = fragment.querySelector('.cell');
				// const checkbox = cell.querySelector('input[type=checkbox]');
				cells.appendChild(fragment);
			}
			rowsElement.appendChild(fragment);
			index += 1;
		}
		this.rows = [...this.container.querySelectorAll('.row')];
		this.updateStatus();
	}

	getRowState(rowIndex) {
		const row = this.rows[rowIndex];
		return [...row.querySelectorAll('.cell')].map(cell => {
			if (cell.classList.contains('success')) return true;
			if (cell.classList.contains('failed')) return false;
			return null;
		});
	}

	roll(rowIndex) {
		const success = super.roll(rowIndex);
		this.updateStatus();
		return success;
	}

	advance(rowIndex) {
		const row = this.rows[rowIndex];
		const maxSteps = parseInt(row.dataset.maxSteps);
		if (maxSteps <= +row.dataset.lastStep) {
			throw new Error("invalid state: cannot advance selected row more");
		}

		const success = this.roll(rowIndex);
		const index = ++row.dataset.lastStep; // 1th based index
		const cell = row.querySelector(`.cell:nth-child(${index})`);
		cell.classList.add(success ? 'success' : 'failed');

		if (maxSteps <= index) {
			row.querySelector('button').disabled = true;
		}
		return success;
	}
}

/**
 * Dehydrated implementation for the engravings rolling simulator for faster (than `VisualSimulator`) execution.
 */
class CodeSimulator extends AbstractSimulator {
	/**
	 * @param {HTMLElement} container 
	 * @param {SimulationSettings} settings 
	 */
	constructor(settings) {
		super(settings);
	}

	reset() {
		super.reset();
		this.rows = this.settings.rows.map(def => new Array(def.steps).fill(null));
	}

	getRowState(rowIndex) {
		return this.rows[rowIndex];
	}

	advance(rowIndex) {
		const row = this.rows[rowIndex];
		const next = row.findIndex(v => v == null);
		if (next <= -1 || row.length <= next) {
			throw new Error("invalid state: cannot advance selected row more");
		}
		const success = this.roll(rowIndex);
		row[next] = success;
		return success;
	}
}


