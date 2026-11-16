# 🚀 Regex_To_Epsilon-nfa

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live%20Demo-afrojkhan6033.github.io-brightgreen?style=for-the-badge&logo=googlechrome&logoColor=white)](https://afrojkhan6033.github.io/Regex-To-Epsilon-nfa/)
[![Hosted on GitHub Pages](https://img.shields.io/badge/Hosted%20With-GitHub%20Pages-222222?style=for-the-badge&logo=githubpages&logoColor=white)](https://afrojkhan6033.github.io/Regex-To-Epsilon-nfa/)
[![Tests Passing](https://img.shields.io/badge/Tests-1535%20Passed-success?style=for-the-badge&logo=checkmarx&logoColor=white)](test.js)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(Pure%20JS)-blue?style=for-the-badge&logo=javascript&logoColor=white)](engine.js)
[![Theme: Dark & Light](https://img.shields.io/badge/Theme-Dark%20%26%20Light-blueviolet?style=for-the-badge&logo=affinitydesigner&logoColor=white)](#-features--specialities)
[![License: MIT](https://img.shields.io/badge/License-MIT-amber?style=for-the-badge&logo=open-source-initiative&logoColor=white)](LICENSE)

<p align="center">
  <strong>An interactive visualizer, compiler pipeline, and step-by-step simulator converting Regular Expressions into ε-NFA using Thompson's Construction Algorithm.</strong>
</p>

<p align="center">
  <a href="https://afrojkhan6033.github.io/Regex-To-Epsilon-nfa/"><strong>🌐 Launch Live Web App</strong></a> •
  <a href="#-features--specialities">Key Features</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-project-structure">Project Structure</a> •
  <a href="#-developer-guide">Developer Guide</a> •
  <a href="#-creator--connect">Author</a>
</p>

</div>

---

> ### 🌐 Live Deployment
> **Try the full interactive simulator directly in your browser:**  
> 👉 [**https://afrojkhan6033.github.io/Regex-To-Epsilon-nfa/**](https://afrojkhan6033.github.io/Regex-To-Epsilon-nfa/)  
> *No installation, no build steps, and no setup required — deployed live via GitHub Pages.*

---

## ⚡ Quick Start

### 🌐 Option 1: Try It Online (Instant Access)
Visit the live deployment at [**https://afrojkhan6033.github.io/Regex-To-Epsilon-nfa/**](https://afrojkhan6033.github.io/Regex-To-Epsilon-nfa/) and start building and simulating automata immediately.

### 💻 Option 2: Run Locally (Offline Mode)
Clone the repository and open `index.html` directly in your browser:
```bash
git clone https://github.com/afrojkhan6033/Regex_To_Epsilon-nfa.git
cd Regex_To_Epsilon-nfa
```
- **Windows**: Double-click `index.html` or run `start index.html` in PowerShell.
- **macOS**: Run `open index.html` in Terminal.
- **Linux**: Run `xdg-open index.html`.

### 🧪 Option 3: Run the Automated Unit Tests (Node.js)
The core engine has zero external dependencies and runs with pure Node:
```bash
node test.js
```
> **Verified Result**: `1535 passed, 0 failed` (verifies parser errors, Thompson invariants, state counts, and native RegExp parity).

---

## ✨ Features & Specialities

- 🎬 **Step-by-Step Construction Player**: Watch sub-automata assemble in real time using an animated postfix stack machine. Includes First, Prev, Play/Pause, Next, and Last controls with live formula tracking.
- 📐 **Collision-Free Dynamic Layout Engine**: Custom geometry engine computes spine alignments and clearance heights ($aboveSpine$, $belowSpine$), ensuring curved loop and skip transitions never overlap states or nested sub-expressions.
- 🔍 **Interactive ε-Closure String Simulator**: Test strings character-by-character using the formal $\hat{\delta}$ extended transition function. Click any character or trace row to spotlight the active state subset directly on the canvas diagram.
- 🌓 **Night / Dark & Light Modes**: Beautiful dual themes with automatic system preference detection and an instant manual `◐` toggle switch.
- 📊 **Dynamic Transition Table ($\delta$)**: Generates an interactive state transition matrix across $\Sigma \cup \{\varepsilon\}$ with start ($\to$) and accept ($*$) state markers.
- 💾 **Multi-Format Exports**: One-click download as SVG vector graphic, CSV transition matrix, technical Markdown report, or direct clipboard copy.
- ⌨️ **Interactive Virtual Keypad & Presets**: Includes one-click test presets (`(a|b)*abb`, `a(b|c)*d`, `0(0|1)*1`, `ab?c+`, `(a|ε)b*`, `(ab)+|c`) and virtual keycaps for special operators (`|`, `*`, `+`, `?`, `(`, `)`, `ε`).

---

## 🧠 How It Works

The engine executes a clean 5-stage compilation and execution pipeline:

```
Regex Input ──► Tokenizer & Validator ──► Concat Inserter (·) ──► Shunting-Yard (Postfix)
                                                                        │
Final SVG Diagram & Table ◄── ε-Closure Simulation ◄── Thompson Stack Machine ◄┘
```

### Thompson's Construction Rules

| Rule | Syntax | Structure / Transitions | States Added |
| :--- | :---: | :--- | :---: |
| **Symbol** | `a` | Two states connected by symbol: $q_i \xrightarrow{a} q_j$ | $2$ |
| **Epsilon** | `ε` | Two states connected by $\varepsilon$: $q_i \xrightarrow{\varepsilon} q_j$ | $2$ |
| **Concatenation** | `RS` | Exit of $R$ connects to Entry of $S$: $f_R \xrightarrow{\varepsilon} s_S$ | $0$ |
| **Union (Or)** | `R\|S` | New start splits to $R, S$; exits join to new final | $2$ |
| **Kleene Star** | `R*` | New start/final with repeat loop and zero-occurrence bypass | $2$ |
| **Positive Closure** | `R+` | Like star, but requires at least 1 match (no skip edge) | $2$ |
| **Optional** | `R?` | Like star, but runs at most 1 match (no repeat edge) | $2$ |

### Mathematical Invariants Guaranteed
1. **Single Entry & Exit**: Exactly one start state and one accept state.
2. **Boundary Protection**: No incoming edges to start state; no outgoing edges from accept state.
3. **Bounded Degree**: Maximum out-degree of any state is $\le 2$.
4. **Exact State Count Formula**:
   $$|Q| = 2 \times \Big(N_{\text{symbols}} + N_{\text{unions}} + N_{\text{stars}} + N_{\text{pluses}} + N_{\text{optionals}}\Big)$$

---

## 📁 Project Structure

| File | Purpose |
| :--- | :--- |
| **`index.html`** | Standalone single-page web app and GitHub Pages root entry point (UI, SVG canvas, step player, string simulator, dark/light themes, and theory accordion). |
| **`engine.js`** | Pure JavaScript computational core (Tokenizer, Validator, Shunting-Yard, Thompson construction, layout, ε-closure simulator, and transition table). Works in browser and Node.js. |
| **`test.js`** | Comprehensive unit test suite with **1,535 assertions** (syntax errors, topological invariants, state count formulas, and fuzzing against native `RegExp`). |
| **`qa.js`** | Headless browser QA test runner using JSDOM for automated validation of SVG elements and UI flows. |
| **`README.md`** | Complete project documentation and developer guide. |

---

## 🛠️ Developer Guide

### 📋 Prerequisites & Environment
- **For running the app**: Any modern web browser (Chrome, Firefox, Safari, Edge). Zero installation required.
- **For running tests**: Node.js (v16 or higher).

### 🧪 Running the Tests
```bash
# 1. Run engine unit tests (Zero dependencies, pure Node)
node test.js

# 2. Run browser E2E QA tests (Requires jsdom)
npm install jsdom
node qa.js
```

### 🧩 How Developers Can Extend the Engine
The engine in [engine.js](file:///a:/Projects/regex_simulator/engine.js) is cleanly decoupled into 6 distinct phases. To add new features (e.g., character classes `[a-z]`, wildcards `.`, or bounded repetitions `{n,m}`):
1. **Tokenizer (`tokenize`)**: Register new token symbols or escape sequences.
2. **Validator (`validate`)**: Add grammar parsing checks in recursive-descent routines (`parseAtom`, `parseRepeat`).
3. **Concat Inserter (`insertConcat`)**: Update `startsAtom` and `endsAtom` sets so implicit concatenation ($\cdot$) is placed correctly.
4. **Shunting-Yard (`toPostfix`)**: Define operator precedence in `PRECEDENCE` and mark as unary or binary.
5. **Thompson Construction (`buildNFA`)**: Add a builder function specifying state coordinates, entry/exit IDs, and clearances.
6. **Unit Tests (`test.js`)**: Add test assertions verifying Thompson invariants (out-degree $\le 2$, single start/final).

---

## 👨‍💻 Creator & Connect

<div align="center">

### Built with care by **Afroj Khan**

[![GitHub Profile](https://img.shields.io/badge/GitHub-afrojkhan6033-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/afrojkhan6033)
[![Star this Repo](https://img.shields.io/badge/Star%20Repo-Regex_To_Epsilon--nfa-yellow?style=for-the-badge&logo=github)](https://github.com/afrojkhan6033/Regex_To_Epsilon-nfa)

<p align="center">
  Passionate about computer science education, automata theory, and building intuitive developer tools.
</p>

<p align="center">
  ⭐ <strong>If you found this project helpful, please give it a Star on GitHub!</strong> ⭐<br>
  Follow <a href="https://github.com/afrojkhan6033">@afrojkhan6033</a> for more open-source simulators, visualizers, and web tools.
</p>

</div>

---

## 📜 License

This project is licensed under the [MIT License](LICENSE) — free for educational, academic, and open-source use.
