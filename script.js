const selectedMods = new Map(); // Хранит выбранные моды (id => объект мода)
const selectedPatches = new Map(); // Хранит выбранные патчи (id => объект патча)

let allMods = []; // Все доступные моды
let allPatches = []; // Все доступные патчи

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
        console.error('Ошибка загрузки модов и патчей:', err);
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
			for (const reqFile of mod.requires) {
				const reqMod = getModByFile(reqFile);
				if (!reqMod || !selectedMods.has(reqMod.id)) return true; // Если зависимость не выбрана - мод заблокирован
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
		return !patch.patches.some(file => {
			const mod = getModByFile(file);
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
            label.textContent = `${mod.name} — ${mod.description}`;

            if (checkbox.disabled) {
                label.style.color = 'color-mix(in lab, var(--color) 60%, var(--Color2) 60%)'; // Блеклый цвет для заблокированных
            }

			// Проверяем конфликты и отсутствующие зависимости
            const isConflict = isPotentiallyConflicting(mod);
            const isDepMissing = mod.requires && mod.requires.length > 0 && !mod.requires.every(r => selectedMods.has(r));

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
					const tooltip = createTooltip(`Альтернативные версии:\n${alternativeNames}`);
					wrapper.appendChild(tooltip);
				}
			}

			// Добавление подсказок для конфликтов
            if (isConflict) {
                wrapper.classList.add('potential-conflict');
                const conflicts = getConflictingMods(mod).map(m => `• ${m.name}`).join('\n');
                const tooltip = createTooltip(`Возможный конфликт с:\n${conflicts}`);
                wrapper.appendChild(tooltip);
            }

			// Добавление подсказок для зависимостей
            if (isDepMissing) {
                wrapper.classList.add('requires');
                const deps = mod.requires.map(modId => {
					const mod = allMods.find(m => m.id === modId);
					return mod ? `• ${mod.name}` : `• ${modId}`;
				}).join('\n');
                const tooltip = createTooltip(`Для этого мода необходимы:\n${deps}`);
                wrapper.appendChild(tooltip);
                if (checkbox.checked) {
                    (isPatch ? selectedPatches : selectedMods).delete(mod.id); // Удаляем из выбранных
					checkbox.checked = false;
				}
            }

			// Добавляем подсказку для патчей
			if (isPatch && mod.patches && mod.patches.length > 0) {
				// Получаем названия модов вместо ID
				const patchedModNames = mod.patches.map(modId => {
					const mod = allMods.find(m => m.id === modId);
					return mod ? `• ${mod.name}` : `• ${modId}`;
				}).join('\n');
				
				const tooltip = createTooltip(`Патчит моды:\n${patchedModNames}`);
				wrapper.appendChild(tooltip);
			}

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
            link.href = mod.download;
            link.textContent = mod.name;
            link.target = '_blank';

			// Добавляем подсказку о конфликтах, если они есть
            if (isPotentiallyConflicting(mod)) {
                wrapper.classList.add('potential-conflict');
                const conflicts = getConflictingMods(mod).map(m => `• ${m.name}`).join('\n');
                const tooltip = createTooltip(`Возможный конфликт с:\n${conflicts}`);
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
}

loadMods();

//Планы на обновления

//указание версий (для более простого отслеживания, без хранения данных о каждой версии) 
//окошко где будет описание и скриншоты
//добавить галочку DevMods для скрытия по умолчанию модов для разработчиков
//