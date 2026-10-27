
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

output = (
    Path(__file__).resolve().parent.parent
    / "frontend"
    / "public"
    / "sample-photos"
)
output.mkdir(parents=True, exist_ok=True)

samples = [
    ["MILK", "EGGS", "TOMATOES", "CHEESE"],
    ["JUICE", "YOGURT", "BUTTER", "WATER"],
    ["CARROTS", "CABBAGE", "MILK", "APPLES"],
]

colors = [
    "#e2f0ff",
    "#e9f7e7",
    "#fff1e2"
]

for index, foods in enumerate(samples, start=1):
    image = Image.new("RGB", (600, 800), "#f6f8fa")
    draw = ImageDraw.Draw(image)

    draw.rectangle(
        (70, 60, 530, 750),
        fill="#dce6eb",
        outline="#738894",
        width=8
    )

    for shelf, food in enumerate(foods):
        y = 110 + shelf * 155

        draw.rounded_rectangle(
            (120, y, 480, y + 110),
            radius=15,
            fill=colors[(shelf + index) % 3],
            outline="#829ba8",
            width=3
        )

        draw.text(
            (165, y + 40),
            food,
            fill="#263f47"
        )

    filename = output / f"fridge-{index}.jpg"
    image.save(filename, "JPEG", quality=90)
    print("Created:", filename)

print("All 3 sample images generated.")
