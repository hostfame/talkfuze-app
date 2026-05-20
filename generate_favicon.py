from PIL import Image, ImageDraw

def create_favicon(input_path, output_path):
    # Load the logo to get the alpha mask
    logo = Image.open(input_path).convert("RGBA")
    
    # We want to make the logo entirely white
    r, g, b, a = logo.split()
    white_img = Image.new("RGBA", logo.size, (255, 255, 255, 255))
    white_logo = Image.composite(white_img, Image.new("RGBA", logo.size, (255, 255, 255, 0)), a)
    
    # Create a background: 256x256 image
    bg_size = 256
    bg = Image.new("RGBA", (bg_size, bg_size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(bg)
    
    # Draw a rounded rectangle for the background (slate grey #475569)
    # Pillow doesn't have a direct rounded_rectangle in older versions, 
    # but let's assume it does or we can draw it
    try:
        draw.rounded_rectangle([(0, 0), (bg_size, bg_size)], radius=50, fill=(71, 85, 105, 255))
    except AttributeError:
        # Fallback to circle or square if rounded_rectangle is not available
        draw.rectangle([(0, 0), (bg_size, bg_size)], fill=(71, 85, 105, 255))
        
    # Resize white logo to fit inside the background (with some padding)
    logo_size = int(bg_size * 0.6)
    white_logo = white_logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    
    # Paste the logo into the center of the background
    offset = ((bg_size - logo_size) // 2, (bg_size - logo_size) // 2)
    bg.paste(white_logo, offset, white_logo)
    
    # Save as ICO with multiple sizes for best compatibility
    icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
    bg.save(output_path, format="ICO", sizes=icon_sizes)
    print("Favicon created successfully!")

if __name__ == "__main__":
    create_favicon("public/talkfuze-logo.png", "src/app/favicon.ico")
