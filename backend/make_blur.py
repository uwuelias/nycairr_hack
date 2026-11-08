# run once in a Python shell from backend/
from PIL import Image, ImageFilter
Image.open("test_images/headphones_label.jpg").filter(
    ImageFilter.GaussianBlur(25)
).save("test_images/headphones_label_blur.jpg")