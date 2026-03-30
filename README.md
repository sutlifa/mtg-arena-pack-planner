
# **MTG Card Acquiring Tool**  
*A multi‑deck Magic: The Gathering acquisition planner with Arena/Paper intelligence, set recommendations, and full Scryfall‑powered card resolution.*

---

## 🌟 **Overview**

**MTG Card Acquiring Tool** is a full‑stack Next.js application designed to answer one deceptively simple question:

> **“What cards do I still need, and what sets should I buy to get them?”**

Paste in multiple decklists, optionally include your MTG Arena collection, and the tool automatically:

- Parses all decklists (Arena, paper, Aetherhub, MTGO‑style formats)
- Normalizes and canonicalizes card names across printings, promos, and Arena‑only variants
- Compares your decks against your Arena collection
- Computes the exact number of missing cards (never more than 4 per card)
- Generates a clean, paper‑friendly shopping list
- Recommends the best sets to buy based on missing cards
- Displays card images, set symbols, rarity colors, and metadata

The result is a **fast, accurate, visually polished** way to plan purchases for both Arena and paper Magic.

---

## 🧠 **Key Features**

### **✔ Multi‑Deck Analysis**
Paste one deck or ten — the tool merges them intelligently using a **max‑per‑deck** rule so you never see inflated card counts.

### **✔ Arena Collection Integration**
Paste your Arena text export. The app automatically:

- Parses quantities  
- Strips set codes and collector numbers  
- Canonicalizes Arena‑only names  
- Resolves aliases and promo variants  

### **✔ Scryfall‑Powered Card Lookup**
Every card is resolved through a hardened lookup pipeline that handles:

- Paper printings  
- Arena‑only printings  
- Double‑faced cards  
- Promo suffixes  
- Showcase/extended art variants  
- Through the Omenpaths cards  
- Set symbols and images  

### **✔ Smart Set Recommender**
Missing cards are grouped by set, showing:

- Set name  
- Set symbol  
- Number of unique missing cards  
- Total copies needed  
- Rarity‑colored breakdown of each card  

Perfect for deciding which boosters or singles to buy.

### **✔ Clean, Fantasy‑Themed UI**
Built with a parchment‑and‑ink aesthetic using Tailwind CSS, including:

- Card images  
- Set icons  
- Expandable set sections  
- Copy‑to‑clipboard shopping list  
- Responsive layout  

---

## 🏗 **Tech Stack**

### **Frontend**
- **Next.js 14+ (App Router)**
- **React 18**
- **Tailwind CSS**
- Custom parchment‑style UI components

### **Backend**
- Next.js API Routes (`app/api/analyze/route.ts`)
- Node‑based parsing and canonicalization pipeline
- Scryfall API integration (with local caching/minified dataset)

### **Core Libraries**
- Custom decklist parser  
- Custom Arena collection parser  
- Canonicalization + alias resolution engine  
- Set recommender engine  
- Scryfall lookup utilities  

---

## 🔍 **How It Works (Architecture)**

### **1. Deck Parsing**
Each decklist is parsed line‑by‑line, extracting:

```
4 Card Name
4x Card Name
Card Name 4
```

Names are normalized and resolved through Scryfall.  
Quantities across decks use:

```
needed = max(qty_per_deck, capped at 4)
```

### **2. Collection Parsing**
Arena exports are parsed using a multi‑strategy approach:

- Arena CSV  
- Aetherhub‑style lists  
- Paper lists  
- Fallback line‑by‑line parsing  

Collector numbers, promo suffixes, and set codes are stripped automatically.

### **3. Card Lookup**
Each card is resolved through a hardened lookup that returns:

- Printed name  
- Arena name (if applicable)  
- Set code + set name  
- Set icon SVG  
- Image URIs  
- Rarity  
- Raw Scryfall data  

### **4. Missing Card Calculation**
For each canonical card:

```
needed = max(deck_qty) - owned
```

### **5. Set Recommendation Engine**
Missing cards are grouped by set:

- Unique cards needed  
- Total copies  
- Rarity breakdown  
- Set symbol  
- Expandable card list  

---

## 🚀 **Running Locally**

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm start
```

---

## 📦 **Deployment**

The project is optimized for **Vercel**:

- Zero‑config deployment  
- Automatic builds from GitHub  
- Supports custom deployment names  
- Works with preview + production environments  

---

## 🧪 **Future Enhancements**

- Booster pack EV calculations  
- Draft/Sealed recommendations  
- Paper‑only mode with TCGPlayer integration  
- Arena wildcard cost estimation  
- Full test suite for canonicalization and parsing  

---

## 🤝 **Contributing**

Contributions are welcome!  
If you’d like to add features, improve parsing, or expand the dataset, feel free to open an issue or submit a pull request.

