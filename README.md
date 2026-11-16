# Thompson's Construction Lab — Regex to $\varepsilon$-NFA Visualizer & Simulator

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests: 1535 Passed](https://img.shields.io/badge/Tests-1535%20Passed-success.svg)](test.js)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(Pure%20JS)-green.svg)](engine.js)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Node.js-orange.svg)](#)

An interactive, zero-build educational and computational laboratory that converts regular expressions into Non-deterministic Finite Automata with $\varepsilon$-transitions ($\varepsilon$-NFA) using **Thompson's Construction algorithm**.

Featuring an interactive step-by-step visual stack machine, dynamic SVG layout engine, live string simulator with $\varepsilon$-closure path tracking, transition table generator ($\delta$), and export utilities (SVG, CSV, Markdown).

---

## 📑 Table of Contents

- [Key Features](#-key-features)
- [How It Works](#-how-it-works)
  - [1. Lexical Analysis & Validation](#1-lexical-analysis--validation)
  - [2. Explicit Concatenation & Shunting-Yard](#2-explicit-concatenation--shunting-yard)
  - [3. Thompson's Construction Algorithm](#3-thompsons-construction-algorithm)
  - [4. Structural Invariants](#4-structural-invariants)
  - [5. $\varepsilon$-Closure Simulation Engine](#5--closure-simulation-engine)
- [Project Architecture](#-project-architecture)
- [Quick Start](#-quick-start)
  - [Browser (No Install Required)](#browser-no-install-required)
  - [Automated Unit Tests (Node.js)](#automated-unit-tests-nodejs)
  - [End-to-End Browser QA (JSDOM)](#end-to-end-browser-qa-jsdom)
- [Interactive UI Guide](#-interactive-ui-guide)
- [Export Capabilities](#-export-capabilities)
- [Repository Setup & Push Guide](#-repository-setup--push-guide)
- [License](#-license)

---

## ✨ Key Features

- **Zero-Build & Self-Contained**: Runs out of the box in any modern browser without npm, webpack, or bundlers.
- **Interactive Stack Machine Visualization**: Step forward, step backward, or auto-play through each postfix token evaluation with state-level fragment animations.
- **Collision-Free Dynamic Layout Engine**: Computes exact Cartesian coordinates for states and bezier curves, guaranteeing clearance even for deeply nested star and union fragments.
- **Interactive $\varepsilon$-Closure String Simulator**: Test test-strings character-by-character. Click any character or trace row to highlight active state subsets directly on the graph.
- **Complete Transition Table ($\delta$)**: Generates an interactive state transition matrix across $\Sigma \cup \{\varepsilon\}$.
- **One-Click Exports**:
  - Export vector diagram as standalone `.svg`
  - Export transition table as `.csv` or copy to clipboard
  - Generate full technical analysis report as `.md`
- **Responsive Dark & Light Modes**: Seamless switching between dark and light themes with system preference detection.
- **Comprehensive Unit Testing**: Includes an automated suite of **1,535 assertions** verifying invariants, state count formulas, and native `RegExp` equivalence.

---

## 🧠 How It Works

The engine executes a 5-stage compilation and execution pipeline:

```
Regex Input  ──►  Tokenizer & Validator  ──►  Concat Inserter  ──►  Shunting-Yard (Postfix)
                                                                            │
Final Diagram & Table  ◄──  Simulation & Tests  ◄──  Thompson Stack Machine ◄┘
```

### 1. Lexical Analysis & Validation
- Parses characters, digits, escape sequences (`\`), groups (`(`, `)`), and operators (`*`, `+`, `?`, `|`, `ε`).
- A recursive-descent grammar validator catches unbalanced parentheses, misplaced operators, empty groups, and invalid characters before processing.

### 2. Explicit Concatenation & Shunting-Yard
Standard regular expressions omit the concatenation operator ($ab \equiv a \cdot b$). The engine inserts an explicit internal concat token ($\cdot$) between adjacent atoms:
```
(a|b)*abb  ──►  (a|b)* · a · b · b  ──►  ab|*a·b·b·  (Postfix)
```
Dijkstra's **Shunting-Yard algorithm** transforms the infix expression into Reverse Polish Notation (RPN), logging a step-by-step trace of the operator stack and output queue.

### 3. Thompson's Construction Algorithm
The postfix token stream is evaluated using a stack machine operating on NFA fragments. Every fragment maintains an invariant spine ($y_{\text{entry}} = y_{\text{exit}}$):

| Operator / Rule | Description | States Added | Transitions Added |
| :--- | :--- | :---: | :--- |
| **Symbol $a$** | Creates 2 states linked by $a$ | $2$ | $q_i \xrightarrow{a} q_j$ |
| **Epsilon $\varepsilon$** | Creates 2 states linked by $\varepsilon$ | $2$ | $q_i \xrightarrow{\varepsilon} q_j$ |
| **Concatenation $R \cdot S$** | Connects exit of $R$ to entry of $S$ via $\varepsilon$ | $0$ | $f_R \xrightarrow{\varepsilon} s_S$ |
| **Union $R \mid S$** | New start branches to $R$ and $S$; both join to new accept | $2$ | $s \xrightarrow{\varepsilon} s_R,\; s \xrightarrow{\varepsilon} s_S,\; f_R \xrightarrow{\varepsilon} f,\; f_S \xrightarrow{\varepsilon} f$ |
| **Kleene Star $R^*$** | Zero or more repetitions | $2$ | $s \xrightarrow{\varepsilon} s_R,\; s \xrightarrow{\varepsilon} f,\; f_R \xrightarrow{\varepsilon} s_R,\; f_R \xrightarrow{\varepsilon} f$ |
| **Positive Closure $R^+$** | One or more repetitions ($R \cdot R^*$) | $2$ | $s \xrightarrow{\varepsilon} s_R,\; f_R \xrightarrow{\varepsilon} s_R,\; f_R \xrightarrow{\varepsilon} f$ |
| **Optional $R?$** | Zero or one occurrence ($R \mid \varepsilon$) | $2$ | $s \xrightarrow{\varepsilon} s_R,\; s \xrightarrow{\varepsilon} f,\; f_R \xrightarrow{\varepsilon} f$ |

### 4. Structural Invariants
Every constructed NFA strictly satisfies Thompson's canonical properties:
1. **Single Start & Single Accept**: Exactly one initial state ($q_{\text{start}}$) and one final state ($q_{\text{accept}}$).
2. **Boundary Restrictions**: No incoming transitions to $q_{\text{start}}$; no outgoing transitions from $q_{\text{accept}}$.
3. **Bounded Out-Degree**: Maximum out-degree of any state is $\le 2$.
4. **Exact State Formula**:
   $$|Q| = 2 \times \Big(N_{\text{symbols}} + N_{\text{unions}} + N_{\text{stars}} + N_{\text{pluses}} + N_{\text{optionals}}\Big)$$

### 5. $\varepsilon$-Closure Simulation Engine
Strings are evaluated using the extended transition function $\hat{\delta}$:
$$\varepsilon\text{-closure}(S) = S \cup \left\{ q' \mid \exists q \in \varepsilon\text{-closure}(S) \text{ such that } q \xrightarrow{\varepsilon} q' \right\}$$
$$\text{move}(S, a) = \{ q' \mid \exists q \in S \text{ such that } q \xrightarrow{a} q' \}$$

At each character, the active state set updates as:
$$S_{i+1} = \varepsilon\text{-closure}\big(\text{move}(S_i, c_{i+1})\big)$$
A string is accepted if and only if all input symbols are consumed and:
$$S_{|w|} \cap F \neq \emptyset$$

---

## 📁 Project Architecture

```
Regex_To_Epsilon-nfa/
├── Regex_To_Epsilon-nfa.html        # Complete, self-contained single-page web app
├── engine.js                        # Pure JS logic (Tokenizer, Validator, Thompson, Sim, Table)
├── test.js                          # Node.js automated test suite (1,535 assertions)
├── qa.js                            # Browser E2E validation test runner using JSDOM
└── README.md                        # Documentation
```

- **`Regex_To_Epsilon-nfa.html`**: Zero-dependency UI featuring SVG rendering, interactive pan-zoom controls, playback runner, and theme toggling.
- **`engine.js`**: Environment-agnostic module that works seamlessly in Node.js (`module.exports`) and browser global scopes (`window.ENGINE`).
- **`test.js`**: Rigorous unit tests checking parser errors, graph invariants, state bounds, and randomized equivalence fuzzing against JavaScript native `RegExp`.
- **`qa.js`**: Headless browser QA validating DOM integrity, layout math, SVG path validity, simulation interactivity, and theme switching.

---

## 🚀 Quick Start

### Browser (No Install Required)
Simply open `Regex_To_Epsilon-nfa.html` in your web browser:
- **Windows**: Double-click the file or run `start Regex_To_Epsilon-nfa.html` in PowerShell.
- **macOS**: Run `open Regex_To_Epsilon-nfa.html` in Terminal.
- **Linux**: Run `xdg-open Regex_To_Epsilon-nfa.html`.

*(Optional)* Serve locally using Python or Node:
```bash
# Python 3
python -m http.server 8080

# Or Node (npx)
npx serve .
```

### Automated Unit Tests (Node.js)
The core engine has zero external dependencies and runs under standard Node.js (v16+):
```bash
node test.js
```
Expected output:
```text
1535 passed, 0 failed
```

### End-to-End Browser QA (JSDOM)
To run the automated browser-level tests in a virtual DOM environment:
```bash
npm install jsdom
node qa.js
```

---

## 🖥️ Interactive UI Guide

1. **Regex Input & Presets**:
   - Type custom expressions or click built-in presets: `(a|b)*abb`, `a(b|c)*d`, `0(0|1)*1`, `ab?c+`, `(a|ε)b*`, `(ab)+|c`.
   - Use operator keycaps (`|`, `*`, `+`, `?`, `(`, `)`, `ε`) for quick insertion.
2. **Postfix Evaluation Trace**:
   - Review how Shunting-Yard handles operator precedence and explicit concatenation insertion.
3. **Step-by-Step Construction Player**:
   - Step through the assembly of individual NFA fragments using `⏮ First`, `◀ Prev`, `▶ Play/Pause`, `▶ Next`, `⏭ Last`.
   - Observe live explanations of Thompson's rule applied at each token.
4. **Final NFA Canvas**:
   - Explore the fully assembled automaton with custom pan and zoom controls (`+`, `−`, `⤢ Fit`).
   - Distinguish transitions with color-coded paths (input symbols vs. $\varepsilon$-moves).
5. **Interactive String Tester**:
   - Input strings (e.g. `abb`) to inspect step-by-step state sets.
   - Click on any token in the string track to spotlight active states on the canvas.

---

## 💾 Export Capabilities

From the Final NFA section, you can export and share your automata:
- **`⭳ Download diagram (.svg)`**: Clean, scalable vector graphic suitable for papers, slides, and documentation.
- **`⭳ Transition table (.csv)`**: Tabular state transition matrix ready for spreadsheet analysis or external parsers.
- **`⭳ Full construction report (.md)`**: Markdown report containing regex metadata, state counts, transition counts, postfix trace, and transition table.
- **`⧉ Copy table`**: Formatted transition matrix copied directly to your clipboard.

---

## 📤 Repository Setup & Push Guide

To upload this project to your GitHub repository ([`https://github.com/afrojkhan6033/Regex_To_Epsilon-nfa`](https://github.com/afrojkhan6033/Regex_To_Epsilon-nfa)):

```bash
# 1. Initialize git in your project directory
git init

# 2. Stage all project files
git add .

# 3. Create initial commit
git commit -m "feat: initial commit for Thompson's Construction Lab"

# 4. Set main branch
git branch -M main

# 5. Link to your remote GitHub repository
git remote add origin https://github.com/afrojkhan6033/Regex_To_Epsilon-nfa.git

# 6. Push to GitHub
git push -u origin main
```

*(If your remote repository already contains an initial commit or README, run `git pull origin main --rebase` before pushing).*

---

## 👨‍💻 Author & Connect

Crafted with care by **Afroj Khan** ([@afrojkhan6033](https://github.com/afrojkhan6033)).

- 🌐 **GitHub Profile**: [github.com/afrojkhan6033](https://github.com/afrojkhan6033)
- 🚀 **Projects**: Explore more interactive computer science labs, compiler tools, and open-source visualizers.
- ⭐ **Support**: If you find this project helpful for your learning, coursework, or teaching, please consider giving it a **Star** and following on GitHub!

---

## 📜 License

This project is licensed under the [MIT License](LICENSE) — feel free to use, modify, and distribute for educational, academic, or personal projects.
