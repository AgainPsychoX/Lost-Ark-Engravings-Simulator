
// Default settings
const settings = {
	darkMode: false,
	simulation: {},
	strategies: {
		onlyOneExpanded: false,
	},
	ace: {
		selectedCustomTheme: false,
		lightTheme: 'ace/theme/chrome',
		darkTheme: 'ace/theme/merbivore',
		options: {
			keyboardHandler: 'ace/keyboard/vscode',
			fontSize: 14,
			printMargin: false,
			showInvisibles: false,
		},
	},
};

function loadSettings() {
	Object.assign(settings, JSON.parse(localStorage.getItem('settings') || '{}'));
	settings.strategies.editorOptions = settings.ace.options;
}
function saveSettings(data) {
	settings.simulation = simulator.settings;
	settings.strategies = strategiesManager.settings;
	settings.strategies.editorOptions = undefined;
	localStorage.setItem('settings', JSON.stringify(data || settings));
	settings.strategies.editorOptions = settings.ace.options;
}

loadSettings();

// Dark mode
if (settings.darkMode) {
	document.body.classList.toggle('dark', true);
}
else {
	document.body.classList.toggle('dark', false);
}
document.querySelector('#darkModeControl').addEventListener('click', (e) => {
	document.body.classList.toggle('dark');
	settings.darkMode = document.body.classList.contains('dark');
	// Reset settings if clicked with Ctrl
	if (e.ctrlKey) {
		saveSettings({darkMode: !settings.darkMode});
		window.location.reload();
		return;
	}
	saveSettings();
	updateAceEditorsOptions();
});

function updateAceEditorsOptions() {
	if (!settings.ace.selectedCustomTheme) {
		settings.ace.options.theme = settings.darkMode 
			? settings.ace.darkTheme 
			: settings.ace.lightTheme;
	}
	document.querySelectorAll('.ace_editor').forEach(e => {
		ace.edit(e).setOptions(settings.ace.options);
	})
}

////////////////////////////////////////////////////////////////////////////////

const simulatorSection = document.querySelector('section#simulator');
const simulator = new VisualSimulator(simulatorSection, settings.simulation);
simulator.prepare();

const strategiesSection = document.querySelector('section#strategies');
const strategiesManager = new StrategiesManager(strategiesSection, simulator, settings.strategies);
updateAceEditorsOptions();

const lastUsedStrategyButton = document.querySelector('.controls button[name=useLastStrategy]');
lastUsedStrategyButton.addEventListener('click', () => {
	const lastUsedStrategy = strategiesManager.findStrategyByName(settings.lastUsedStrategyName);
	if (lastUsedStrategy) {
		strategiesManager.runStrategy(lastUsedStrategy);
	}
	else {
		alert(`Couldn't find last strategy`);
	}
});

strategiesManager.setOnRunBegin((strategy, simulator) => {
	// Update last used strategy button
	const name = settings.lastUsedStrategyName = strategy.metadata.name;
	lastUsedStrategyButton.querySelector('.name').innerText = name;

	// TODO: show busy, lock controls
});

window.addEventListener('load', () => {
	// Simple utility for simple loading note
	document.querySelectorAll('.self-remove-onload').forEach(e => e.remove());

	// Auto-extend and display last used strategy
	const lastUsedStrategy = strategiesManager.findStrategyByName(settings.lastUsedStrategyName);
	if (lastUsedStrategy) {
		lastUsedStrategyButton.querySelector('.name').innerText = settings.lastUsedStrategyName;
		setTimeout(() => {
			lastUsedStrategy.html.querySelector('summary').dispatchEvent(new MouseEvent('click'));
		}, 250)
	}
}, {once: true});

// Delay input control
const delayInput = document.querySelector('.controls input[name=delay]');
delayInput.value = strategiesManager.settings.delay;
delayInput.addEventListener('change', function () {
	strategiesManager.setStepByStepDelay(parseInt(this.value))
});

// Step by step controls
const stepButton = document.querySelector('.controls button[name=step]');
const stepByStepCheckbox = document.querySelector('.controls input[name=stepByStep]');
stepButton.style.display = this.checked ? '' : 'none';
stepByStepCheckbox.checked = strategiesManager.settings.stepByStep;
stepByStepCheckbox.addEventListener('change', function () {
	strategiesManager.settings.stepByStep = this.checked;
	stepButton.style.display = this.checked ? '' : 'none';
});
stepButton.addEventListener('click', () => {
	strategiesManager.stepController.next();
});

// Keyboard shortcuts
// Note: The `accesskey` attribute, requiring ALT or other platform dependent key shortcuts, isn't good enough.
// Note: Focusing is disabled for smoother usage.
document.addEventListener('keydown', e => {
	if (!document.activeElement || document.activeElement == document.body) {
		if (1 <= e.key && e.key <= 9) {
			const index = parseInt(e.key) - 1;
			const button = simulatorSection.querySelectorAll('.rows button[name=roll]').item(index);
			button.click();
			return;
		}
		switch (e.key.toUpperCase()) {
			case 'R': {
				const button = simulatorSection.querySelector('button[name=reset]');
				button.click();
				break;
			}
			// Detect ACE editor settings menu, to save settings and propagate settings changes.
			case ',': {
				debugger;
				//document.activeElement
				setTimeout(() => {
					// document.getElementById('ace_settingsmenu').
					// updateAceEditorsOptions();
					// selectedCustomTheme: false,
				}, 500);
				break;
			}
		}
	}
});

////////////////////////////////////////////////////////////////////////////////
// Helper functions to use in the strategies code.

/**
 * @param {StrategyDefinition} x 
 */
const registerStrategy = strategy => strategiesManager.registerStrategy(strategy);

/**
 * Selects from remaining rows in specified order.
 * @param {number[]} remaining Array of numbers of cells remaining for each row.
 * @param {number[]} order Priority order for the rows, as array of row indexes.
 * @param {number} [other] If no row can be used, this value is returned.
 * @returns {number} Selected row.
 */
function remainingInOrder(remaining, order, other = -1) {
	for (let i = 0; i < order.length; i++) {
		if (remaining[order[i]]) {
			return order[i];
		}
	}
	return other;
}

////////////////////////////////////////////////////////////////////////////////
