from PIL import Image, ImageDraw

def create_icon(input_path, output_path):
    logo = Image.open(input_path).convert("RGBA")
    r, g, b, a = logo.split()
    
    # Make logo solid white
    white_logo = Image.composite(
        Image.new("RGBA", logo.size, (255, 255, 255, 255)),
        Image.new("RGBA", logo.size, (255, 255, 255, 0)),
        a
    )
    
    # 512x512 background for App Icon
    bg_size = 512
    bg = Image.new("RGBA", (bg_size, bg_size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(bg)
    
    # Rounded rectangle (blue #0070f3 or slate #475569) 
    # Let's use slate #475569 as requested
    draw.rounded_rectangle([(0, 0), (bg_size, bg_size)], radius=100, fill=(71, 85, 105, 255))
    
    # Logo size 60% of bg
    logo_size = int(bg_size * 0.6)
    white_logo = white_logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    
    offset = ((bg_size - logo_size) // 2, (bg_size - logo_size) // 2)
    bg.paste(white_logo, offset, white_logo)
    
    bg.save(output_path, "PNG")

if __name__ == "__main__":
    create_icon("public/talkfuze-logo.png", "src/app/icon.png")
