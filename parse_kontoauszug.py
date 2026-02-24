import pdfplumber
import re
import csv

pdf = pdfplumber.open('/Users/laurentmanes/Projekte/AI Invest/Kontoauszug.pdf')

# Extract all text
all_text = ""
for page in pdf.pages:
    text = page.extract_text()
    if text:
        all_text += text + "\n"

# Parse all trade transactions
lines = all_text.split('\n')

trades = []
i = 0
while i < len(lines):
    line = lines[i].strip()
    
    # Join with next line(s) if needed for split entries
    combined = line
    for j in range(1, 4):
        if i + j < len(lines):
            combined += " " + lines[i + j].strip()
    
    # Match trade patterns
    match = re.search(
        r'(Buy|Sell)\s+trade\s+([A-Z0-9]{12})\s+(.+?),\s*quantity:\s*([\d,.]+)\s+€([\d,.]+)',
        combined
    )
    
    if match:
        action = match.group(1)
        isin = match.group(2)
        name = match.group(3).strip()
        qty_str = match.group(4).replace(',', '')
        amount_str = match.group(5).replace(',', '')
        
        quantity = float(qty_str)
        amount = float(amount_str)
        price_per_share = amount / quantity if quantity > 0 else 0
        
        trades.append({
            'action': action.lower(),
            'isin': isin,
            'name': name,
            'quantity': quantity,
            'amount': amount,
            'price': price_per_share
        })
    
    i += 1

# Aggregate positions (buy - sell)
positions = {}
for t in trades:
    key = t['isin']
    if key not in positions:
        positions[key] = {
            'isin': t['isin'],
            'name': t['name'],
            'total_qty': 0,
            'total_invested': 0,
            'buy_qty': 0,
            'sell_qty': 0,
        }
    
    if t['action'] == 'buy':
        positions[key]['buy_qty'] += t['quantity']
        positions[key]['total_qty'] += t['quantity']
        positions[key]['total_invested'] += t['amount']
    elif t['action'] == 'sell':
        positions[key]['sell_qty'] += t['quantity']
        positions[key]['total_qty'] -= t['quantity']
        if positions[key]['buy_qty'] > 0:
            avg_buy = positions[key]['total_invested'] / positions[key]['buy_qty']
            positions[key]['total_invested'] -= avg_buy * t['quantity']
            if positions[key]['total_invested'] < 0:
                positions[key]['total_invested'] = 0

# Filter to positions still held (qty > 0.001)
held = {k: v for k, v in positions.items() if v['total_qty'] > 0.001}

print(f"Gesamt Trades gefunden: {len(trades)}")
print(f"Verschiedene Wertpapiere: {len(positions)}")
print(f"Noch gehaltene Positionen: {len(held)}")
print()

# Write CSV
csv_path = '/Users/laurentmanes/Projekte/AI Invest/portfolio_import.csv'
with open(csv_path, 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f, delimiter=';')
    writer.writerow(['Name', 'ISIN', 'Anzahl', 'Kaufkurs', 'Waehrung'])
    
    for key in sorted(held.keys(), key=lambda k: held[k]['name']):
        pos = held[key]
        qty = round(pos['total_qty'], 6)
        avg_price = round(pos['total_invested'] / pos['buy_qty'], 2) if pos['buy_qty'] > 0 else 0
        writer.writerow([pos['name'], pos['isin'], qty, avg_price, 'EUR'])
        print(f"  {pos['name']:<50} ISIN: {pos['isin']}  Stk: {qty:>12.4f}  Avg: {avg_price:>8.2f} EUR")

print(f"\nCSV gespeichert: {csv_path}")
