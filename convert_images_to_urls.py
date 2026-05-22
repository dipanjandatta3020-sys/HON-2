"""
Batch convert all local image paths to GitHub raw URLs.
This script:
1. Updates products.json
2. Updates all HTML files (img src attributes)
3. Updates admin panel files
"""
import json
import os
import re
import glob

GITHUB_BASE = "https://raw.githubusercontent.com/dipanjandatta3020-sys/HON-2/main"

def to_github_url(local_path):
    """Convert a local image path to a GitHub raw URL."""
    # Don't convert if already a URL
    if local_path.startswith('http://') or local_path.startswith('https://'):
        return local_path
    # Don't convert empty paths
    if not local_path.strip():
        return local_path
    
    # URL-encode spaces and special chars
    from urllib.parse import quote
    encoded_path = quote(local_path, safe='/')
    return f"{GITHUB_BASE}/{encoded_path}"

def update_products_json():
    """Update all image paths in products.json."""
    with open('products.json', 'r', encoding='utf-8') as f:
        products = json.load(f)
    
    for product in products:
        if 'images' in product:
            product['images'] = [to_github_url(img) for img in product['images']]
    
    with open('products.json', 'w', encoding='utf-8') as f:
        json.dump(products, f, indent=2)
    
    print(f"  Updated {len(products)} products in products.json")

def update_html_files():
    """Update all img src attributes in HTML files."""
    html_files = glob.glob('*.html') + glob.glob('admin/*.html')
    
    # Patterns for local image references
    # Match src="BEST SELLER/..." or src="Logo_HON..." etc.
    local_img_pattern = re.compile(
        r'(src=["\'])'
        r'((?:BEST SELLER|Web Images|Logo_HON|Lamp|uploads/)[^"\']*)'
        r'(["\'])'
    )
    
    # Also match src="http://localhost:8080/..." and convert to GitHub
    localhost_pattern = re.compile(
        r'(src=["\'])http://localhost:8080/([^"\']*?)(["\'])'
    )
    
    for html_file in html_files:
        with open(html_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        
        # Replace localhost URLs
        def replace_localhost(match):
            prefix, path, suffix = match.group(1), match.group(2), match.group(3)
            # Don't convert API paths
            if path.startswith('api'):
                return match.group(0)
            return f'{prefix}{to_github_url(path)}{suffix}'
        
        content = localhost_pattern.sub(replace_localhost, content)
        
        # Replace local paths
        def replace_local(match):
            prefix, path, suffix = match.group(1), match.group(2), match.group(3)
            return f'{prefix}{to_github_url(path)}{suffix}'
        
        content = local_img_pattern.sub(replace_local, content)
        
        if content != original:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"  Updated: {html_file}")
        else:
            print(f"  No changes: {html_file}")

def update_admin_app_js():
    """Update admin/app.js to remove localhost references."""
    filepath = 'admin/app.js'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace localhost:8080 image URLs with direct URL usage
    content = content.replace(
        "http://localhost:8080/${product.images[0]}",
        "${product.images[0]}"
    )
    content = content.replace(
        "http://localhost:8080/placeholder.png",
        ""
    )
    content = content.replace(
        "http://localhost:8080/${path}",
        "${path}"
    )
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  Updated: {filepath}")

if __name__ == '__main__':
    print("=== Converting local images to GitHub URLs ===\n")
    
    print("[1/3] Updating products.json...")
    update_products_json()
    
    print("\n[2/3] Updating HTML files...")
    update_html_files()
    
    print("\n[3/3] Updating admin/app.js...")
    update_admin_app_js()
    
    print("\n=== Done! All images now use GitHub URLs ===")
