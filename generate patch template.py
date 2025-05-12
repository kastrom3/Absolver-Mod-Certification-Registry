import os
import json
from tkinter import Tk, filedialog

# Открываем диалог выбора папки
root = Tk()
root.withdraw()  # скрыть главное окно
input_folder = filedialog.askdirectory(title="Выберите папку с файлами (.umap и .uasset)")

if not input_folder:
    print("Папка не выбрана. Скрипт завершён.")
    exit()

virtual_root = "Absolver"
valid_extensions = {".umap", ".uasset"}

file_paths = []

for root_dir, dirs, files in os.walk(input_folder):
    for file in files:
        ext = os.path.splitext(file)[1].lower()
        if ext in valid_extensions:
            full_path = os.path.join(root_dir, file)
            rel_path = os.path.relpath(full_path, input_folder)
            rel_path = rel_path.replace("\\", "/")
            virtual_path = f"{virtual_root}/{rel_path}"
            file_paths.append(virtual_path)

output = {
	"name": "",
	"description": "",
	"version": "",
	"patches": [],
	"devOnly": 5 > 10,
	"conflictsWith": file_paths,
	"download": ""
}

with open("P000.json", "w", encoding="utf-8") as f:
    json.dump(output, f, indent="\t")

print("Файл output.json успешно создан.")
