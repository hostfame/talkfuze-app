import sys
from PIL import Image

def convert_logo(input_path, output_path, is_ico=False):
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    
    newData = []
    for item in data:
        # Check if pixel is white (with tolerance) or transparent
        if item[0] > 230 and item[1] > 230 and item[2] > 230:
            # White background -> Transparent
            newData.append((255, 255, 255, 0))
        elif item[3] < 10:
            # Already transparent -> keep transparent
            newData.append((255, 255, 255, 0))
        else:
            # Colored pixel -> Make it slate grey #475569 (71, 85, 105)
            # Maybe keep some of the lightness variations? No, just solid grey with alpha
            newData.append((71, 85, 105, item[3]))
            
    img.putdata(newData)
    
    if is_ico:
        # Resize to typical favicon size
        img = img.resize((32, 32), Image.Resampling.LANCZOS)
        img.save(output_path, format="ICO")
    else:
        img.save(output_path, "PNG")

if __name__ == "__main__":
    convert_logo("public/talkfuze-logo.png", "public/talkfuze-logo-grey.png")
    convert_logo("public/talkfuze-logo.png", "src/app/favicon.ico", is_ico=True)
    print("Logos converted!")
