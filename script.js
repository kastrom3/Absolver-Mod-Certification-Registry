const selectedMods = new Map(); // Хранит выбранные моды (id => объект мода)
const selectedPatches = new Map(); // Хранит выбранные патчи (id => объект патча)

let allMods = []; // Все доступные моды
let allPatches = []; // Все доступные патчи
let showDevMods = false; // Скрывать моды для разработчиков

async function loadMods() {
	// Инициализация DOM-элементов
	const modList = document.getElementById('mod-list');
	const selectedList = document.getElementById('selected-mods');
	const patchList = document.createElement('ul');
	patchList.id = 'patch-list';
	document.getElementById('selected').appendChild(patchList);

	try {
		// Загрузка индексного файла
		const indexRes = await fetch('mods/index.json');
		const indexData = await indexRes.json();

		// Формирование путей к файлам
		const modFiles = indexData.mods.map(id => `mods/${id}.json`);
		const patchFiles = indexData.patches.map(id => `mods/${id}.json`);

		// Параллельная загрузка всех модов и патчей
		const modPromises = modFiles.map(file => fetch(file).then(res => res.json()));
		const patchPromises = patchFiles.map(file => fetch(file).then(res => res.json()));

		// Обработка данных
		const mods = await Promise.all(modPromises);
		const patches = await Promise.all(patchPromises);

		// Форматирование данных модов
		allMods = mods.map((mod, i) => ({
			...mod, // Копируем все свойства из исходного объекта
			type: 'mod', // Добавляем тип
			id: indexData.mods[i], // Добавляем ID из индексного файла
			file: modFiles[i], // Сохраняем имя файла
			nonConflicting: mod.nonConflicting || false, // Добавляем флаг неконфликтности
			requires: mod.requires || [], // Добавляем зависимости (по умолчанию пустой массив)
			conflictsWith: mod.conflictsWith || [], // Добавляем конфликты (по умолчанию пустой массив)
			alternatives: mod.alternatives || [] // Добавляем альтернативные моды (по умолчанию пустой массив)
		}));

		// Форматирование данных патчей
		allPatches = patches.map((patch, i) => ({
			...patch, // Копируем все свойства из исходного объекта
			type: 'patch', // Добавляем тип
			id: indexData.patches[i], // Добавляем ID из индексного файла
			file: patchFiles[i], // Сохраняем имя файла
			patches: patch.patches || [], // Список модов, которые патч модифицирует
			conflictsWith: patch.conflictsWith || [], // Добавляем конфликты (по умолчанию пустой массив)
		}));

		renderAll();

	} catch (err) {
		console.error('Error loading mods and patches:', err);
	}

	function parseModPairs(rawArray) {
		const modIdRegex = /^M\d+$/; // Совпадает с "M001", "M123" и т.п.
		const pairs = [];

		for (let i = 0; i < rawArray.length; i++) {
			const current = rawArray[i];
			const next = rawArray[i + 1];

			if (modIdRegex.test(current)) {
				// Следующий элемент — версия, если он не похож на ID
				if (next && !modIdRegex.test(next)) {
					pairs.push({ id: current, version: next });
					i++; // Пропускаем версию
				} else {
					pairs.push({ id: current, version: '?' });
				}
			}
		}
		return pairs;
	}

	// Поиск мода по имени файла
function getModByFile(fileName) {
		return allMods.find(mod => mod.id === fileName);
	}

	// Функция для получения списка выбранных модов
	function getSelectedNames() {
		return [...selectedMods.keys()];
	}

	// Проверка наличия патча для двух модов
	function isPatched(modA, modB) {
		return [...selectedPatches.values()].some(patch =>
			patch.patches.includes(modA.id) &&
			patch.patches.includes(modB.id)
		);
	}

	// Проверка конфликта между модами
	function getConflict(modA, modB) {
		// Проверка на тот же мод
		if (modA.id === modB.id) return false;
		
		// Проверка зависимостей
		const requiresA = modA.requires || [];
		const requiresB = modB.requires || [];
		if (requiresA.includes(modB.id) || requiresB.includes(modA.id)) return false;
		
		// Проверка наличия патча
		if (isPatched(modA, modB)) return false;

		// Проверка конфликтов
		const conflictsA = modA.conflictsWith || [];
		const conflictsB = modB.conflictsWith || [];
		return conflictsA.some(file => conflictsB.includes(file));
	}

	// Проверка конфликта между патчами
	function getConflictPatch(patchA, patchB) {
		// Проверка на тот же мод
		if (patchA.id === patchB.id) return false;
		
		// Проверка зависимостей
		const requiresA = patchA.requires || [];
		const requiresB = patchB.requires || [];
		if (requiresA.includes(patchB.id) || requiresB.includes(patchA.id)) return false;
		
		// Проверка наличия патча
		if (isPatched(patchA, patchB)) return false;
		
		// Проверка конфликтов
		const conflictsA = patchA.conflictsWith || [];
		const conflictsB = patchB.conflictsWith || [];
		return conflictsA.some(file => conflictsB.includes(file));
	}

	// Возвращает список модов, конфликтующих с указанным
	function getConflictingMods(mod) {
		return [...selectedMods.values()].filter(other =>
			getConflict(mod, other) &&
			mod.nonConflicting && other.nonConflicting // Учитываем только если оба помечены как nonConflicting
		);
	}

	// Проверка блокировки мода
	function isBlocked(mod) {
		if (selectedMods.has(mod.id)) return false; // Уже выбранный мод не заблокирован

		// Проверка зависимостей
		if (mod.requires.length > 0) {
			const reqs = parseModPairs(mod.requires); // учёт версий
			for (const { id } of reqs) {
				const reqMod = getModByFile(id);
				if (!reqMod || !selectedMods.has(reqMod.id)) return true;
			}
		}

		// Проверка на конфликты (только для обычных модов)
		if (!mod.nonConflicting) {
			for (const selected of selectedMods.values()) {
				// Проверяем конфликт только если оба мода обычные
				if (!selected.nonConflicting && getConflict(mod, selected)) {
					return true;
				}
			}
		}

		return false;
	}

	// Проверка блокировки патча
	function isBlockedPatch(patch) {
		// Проверка на конфликты
		for (const selected of selectedPatches.values()) {
			if (getConflictPatch(patch, selected)) {
				return true; // Если конфликт и не помечены как nonConflicting - мод заблокирован
			}
		}
		// Патч заблокирован, если нет выбранных модов, которые он патчит
		const requiredMods = parseModPairs(patch.patches); // учёт версий
		return !requiredMods.some(pair => {
			const mod = getModByFile(pair.id);
			return mod && selectedMods.has(mod.id);
		});
	}

	// Проверка потенциальных конфликтов
	function isPotentiallyConflicting(mod) {
		return getConflictingMods(mod).length > 0;
	}

	// Создает элемент подсказки
	function createTooltip(text) {
		const span = document.createElement('span');
		span.className = 'tooltiptext';
		span.textContent = text;
		return span;
	}

	// Рендеринг списка модов/патчей
	function renderModList(container, mods, isPatch = false) {
		container.innerHTML = ''; // Очищаем контейнер

		mods = mods.filter(mod => showDevMods || !mod.devOnly);

		mods.forEach(mod => {
			const li = document.createElement('li');
			const wrapper = document.createElement('div');
			wrapper.className = 'tooltip';

			// Создание чекбокса
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.id = mod.id;
			const isSelected = isPatch ? selectedPatches.has(mod.id) : selectedMods.has(mod.id);

			checkbox.checked = isSelected;
			checkbox.disabled = isPatch ? isBlockedPatch(mod) : isBlocked(mod); // Блокируем если нужно

			// Обработчик изменения состояния
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					(isPatch ? selectedPatches : selectedMods).set(mod.id, mod); // Добавляем в выбранные
				} else {
					(isPatch ? selectedPatches : selectedMods).delete(mod.id); // Удаляем из выбранных
				}
				renderAll(); // Перерисовываем интерфейс
			});

			// Создаем подпись к чекбоксу
			const label = document.createElement('label');
			label.setAttribute('for', mod.id);
			label.textContent = `${mod.name}`;

			if (checkbox.disabled) {
				label.style.color = 'color-mix(in lab, var(--color) 60%, var(--Color2) 60%)'; // Блеклый цвет для заблокированных
			}

			// Проверяем конфликты и отсутствующие зависимости
			const isConflict = isPotentiallyConflicting(mod);
			const isDepMissing = mod.requires && mod.requires.length > 0 && !parseModPairs(mod.requires).every(req => selectedMods.has(req.id));

			// Добавляем подсказки только если мод выбран
			if (isSelected) {
				// Находим все моды, которые являются альтернативами текущего
				const alternatives = allMods.filter(m => {
					// Проверяем, что текущий мод есть в альтернативах другого мода
					const isAlternative = m.alternatives && m.alternatives.includes(mod.id);
					// Или что другой мод есть в альтернативах текущего
					const hasAlternative = mod.alternatives && mod.alternatives.includes(m.id);
					return (isAlternative || hasAlternative) && m.id !== mod.id;
				});

				if (alternatives.length > 0) {
					wrapper.classList.add('has-alternatives');
					const alternativeNames = alternatives.map(m => `• ${m.name}`).join('\n');
					const tooltip = createTooltip(`Alternative versions:\n${alternativeNames}`);
					wrapper.appendChild(tooltip);
				}
			}

			// Добавление подсказок для конфликтов
			if (isConflict) {
				wrapper.classList.add('potential-conflict');
				const conflicts = getConflictingMods(mod).map(m => `• ${m.name}`).join('\n');
				const tooltip = createTooltip(`Possible conflict with:\n${conflicts}`);
				wrapper.appendChild(tooltip);
			}

			// Добавление подсказок для зависимостей
			if (isDepMissing) {
				wrapper.classList.add('requires');
				const deps = parseModPairs(mod.requires).map(dep => {
					const m = allMods.find(m => m.id === dep.id);
					const name = m ? m.name : dep.id;
					return `• ${name} (ver: ${dep.version})`;
				}).join('\n');

				const tooltip = createTooltip(`This mod requires:\n${deps}`);
				wrapper.appendChild(tooltip);
				
				if (checkbox.checked) {
					(isPatch ? selectedPatches : selectedMods).delete(mod.id); // Удаляем из выбранных
					checkbox.checked = false;
				}
			}

			// Добавляем подсказку для патчей
			if (isPatch && mod.patches && mod.patches.length > 0) {
				// Получаем названия модов вместо ID
				const patchedModNames  = parseModPairs(mod.patches).map(patch => {
					const m = allMods.find(m => m.id === patch.id);
					const name = m ? m.name : patch.id;
					return `• ${name} (ver: ${patch.version})`;
				}).join('\n');
				
				const tooltip = createTooltip(`Patched mods:\n${patchedModNames}`);
				wrapper.appendChild(tooltip);
			}

			// Добавляем информацию о моде при наведении мышью
			label.addEventListener('mouseenter', () => {
				const infoBox = document.getElementById('mod-info');
				infoBox.innerHTML = ''; // Очистка

				const title = document.createElement('h3');
				title.textContent = mod.name;

				const slider = document.createElement('div');
				slider.id = 'slider';

				if (mod.screenshots && Array.isArray(mod.screenshots)) {
					mod.screenshots.forEach(url => {
						const img = document.createElement('img');
						img.src = url;
						img.alt = mod.name;
						slider.appendChild(img);
					});
				}

				const desc = document.createElement('p');
				desc.className = 'mod-description';
				desc.textContent = mod.description;

				const version = document.createElement('div');
				version.textContent = `Mod version: ${mod.version || "not specified"}`;
				version.className = 'ver';

				// Создаем правый блок с зависимостями или патчами
				const meta = document.createElement('div');
				meta.className = 'mod-meta';

				const hr = document.createElement('hr');

				const list = document.createElement('ul');

				if (mod.type === 'patch' && mod.patches?.length) {
					list.textContent = `Patched mods:`;
					const patches = parseModPairs(mod.patches);
					patches.forEach(({ id, version }) => {
						const m = allMods.find(m => m.id === id);
						const li = document.createElement('li');
						const name = m ? m.name : id;
						li.textContent = `${name} (ver: ${version})`;
						list.appendChild(li);
					});
				} else if (mod.requires?.length) {
					list.textContent = `Requires on mods:`;
					const requires = parseModPairs(mod.requires);
					requires.forEach(({ id, version }) => {
						const m = allMods.find(m => m.id === id);
						const li = document.createElement('li');
						const name = m ? m.name : id;
						li.textContent = `${name} (ver: ${version})`;
						list.appendChild(li);
					});
				}

				meta.appendChild(list);

				infoBox.appendChild(title);
				if (mod.screenshots && Array.isArray(mod.screenshots) && mod.screenshots.length > 0) {
					infoBox.appendChild(slider);
					const sliders = document.querySelectorAll("#slider");
					sliders.forEach(function(slider) {
						slider.addEventListener('wheel', function(event) {
							let modifier;
							if (event.deltaMode === event.DOM_DELTA_PIXEL) {
								modifier = 1;
							} else if (event.deltaMode === event.DOM_DELTA_LINE) {
								modifier = parseInt(getComputedStyle(this).lineHeight);
							} else if (event.deltaMode === event.DOM_DELTA_PAGE) {
								modifier = this.clientHeight;
							}
							if (event.deltaY !== 0) {
								this.scrollLeft += modifier * event.deltaY;
								event.preventDefault();
							}
						});
					});
				}
				infoBox.appendChild(desc);
				infoBox.appendChild(version);
				infoBox.appendChild(hr);
				infoBox.appendChild(meta);
			});

			// Добавляем элементы в DOM
			wrapper.appendChild(checkbox);
			wrapper.appendChild(label);
			li.appendChild(wrapper);
			container.appendChild(li);
		});
	}

	// Рендеринг выбранных модов
	function renderSelectedList() {
		const selectedList = document.getElementById('selected-mods');
		selectedList.innerHTML = '';

		[...selectedMods.values()].forEach(mod => {
			const li = document.createElement('li');
			const wrapper = document.createElement('div');
			wrapper.className = 'tooltip';

			// Создаем ссылку для скачивания
			const link = document.createElement('a');
			link.href = mod.download || `https://tovern.tk/404`;
			link.textContent = mod.name;
			link.target = '_blank';

			// Добавляем подсказку о конфликтах, если они есть
			if (isPotentiallyConflicting(mod)) {
				wrapper.classList.add('potential-conflict');
				const conflicts = getConflictingMods(mod).map(m => `• ${m.name}`).join('\n');
				const tooltip = createTooltip(`Possible conflict with:\n${conflicts}`);
				wrapper.appendChild(tooltip);
			}

			wrapper.appendChild(link);
			li.appendChild(wrapper);
			selectedList.appendChild(li);
		});
	}

	// Рендеринг выбранных патчей
	function renderSelectedPatches() {
		const selectedPatchList = document.getElementById('selected-mods');

		[...selectedPatches.values()].forEach(patch => {
			const li = document.createElement('li');
			const wrapper = document.createElement('div');
			wrapper.className = 'tooltip';

			// Создаем ссылку для скачивания
			const link = document.createElement('a');
			link.href = patch.download;
			link.textContent = patch.name || patch.id;
			link.target = '_blank';

			wrapper.appendChild(link);
			li.appendChild(wrapper);
			selectedPatchList.appendChild(li);
		});
	}

	// Общий рендеринг
	function renderAll() {
		// Проверяем выбранные патчи на доступность
		const patchesToRemove = [];
		selectedPatches.forEach((patch, id) => {
			if (isBlockedPatch(patch)) {
				patchesToRemove.push(id);
			}
		});
		
		// Удаляем недоступные патчи
		patchesToRemove.forEach(id => {
			selectedPatches.delete(id);
		});

		renderModList(document.getElementById('mod-list'), allMods); // Список всех модов
		renderSelectedList(); // Список выбранных модов
		renderSelectedPatches(); // Список выбранных патчей

		// Фильтруем патчи, оставляя только те, для которых выбран хотя бы один мод
		const visiblePatches = allPatches.filter(patch =>
			patch.patches.some(name => selectedMods.has(name))
		);
		renderModList(document.getElementById('patch-list'), visiblePatches, true);
	}

	document.getElementById('toggle-devmods').addEventListener('change', function () {
		showDevMods = this.checked;
		renderAll();
	});
}

loadMods();