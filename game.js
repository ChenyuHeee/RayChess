// 游戏主逻辑
class LaserChessGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gridSize = 50;
        this.cellSize = 12; // 每个格子的像素大小
        this.padding = 20;
        
        // 游戏状态
        this.gamePhase = 'placeBase'; // placeBase, placeMirrors, gameOver
        this.redBase = null; // {x, y}
        this.blueBase = null; // {x, y}
        this.mirrors = []; // [{x1, y1, x2, y2, player}]
        this.moveHistory = [];
        this.aiEnabled = false;
        this.aiPlayer = 'blue'; // AI控制的玩家
        this.baseOpenSide = { red: null, blue: null }; // 记录每个基地保留的开口方向
        this.baseOpenChoice = 'top';
        this.aiThinking = false;
        this.aiThoughtMirror = null;
        this.aiThinkingTrace = null; // AI 评估的候选信息
        this.winner = null; // 记录获胜方
        this.currentPlayer = 'red';
        this.winningLaser = null;
        this.pendingWinCheck = null; // 等待到下个回合开始时检查的进攻方
        
        // 交互状态
        this.selectedPoint = null; // 镜子放置的第一个点
        this.hoverPoint = null; // 鼠标悬停的点
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.updateStatus();
        this.draw();
    }
    
    setupCanvas() {
        const size = this.gridSize * this.cellSize + this.padding * 2;
        this.canvas.width = size;
        this.canvas.height = size;
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('toggleAIBtn').addEventListener('click', () => this.toggleAI());
        document.getElementById('gridSize').addEventListener('change', (e) => {
            this.gridSize = parseInt(e.target.value);
            this.reset();
        });
        const openSideSelect = document.getElementById('openSideSelect');
        if (openSideSelect) {
            openSideSelect.addEventListener('change', (e) => {
                this.baseOpenChoice = e.target.value;
            });
        }
    }
    
    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        return {x, y};
    }
    
    getNearestGridPoint(x, y) {
        const gridX = Math.round((x - this.padding) / this.cellSize);
        const gridY = Math.round((y - this.padding) / this.cellSize);
        
        if (gridX >= 0 && gridX <= this.gridSize && gridY >= 0 && gridY <= this.gridSize) {
            return {x: gridX, y: gridY};
        }
        return null;
    }
    
    handleMouseMove(e) {
        const {x, y} = this.getCanvasCoordinates(e);
        this.hoverPoint = this.getNearestGridPoint(x, y);
        this.draw();
    }
    
    handleClick(e) {
        if (this.checkPendingWin()) return;
        const {x, y} = this.getCanvasCoordinates(e);
        const point = this.getNearestGridPoint(x, y);
        
        if (!point) return;
        
        if (this.gamePhase === 'placeBase') {
            this.placeBase(point);
        } else if (this.gamePhase === 'placeMirrors') {
            this.placeMirror(point);
        }
    }
    
    placeBase(point) {
        const {x, y} = point;
        
        // 检查是否已经有基地在这个位置
        if ((this.redBase && this.redBase.x === x && this.redBase.y === y) ||
            (this.blueBase && this.blueBase.x === x && this.blueBase.y === y)) {
            this.showMessage('该位置已有基地', 'error');
            return;
        }
        
        if (this.currentPlayer === 'red') {
            this.redBase = {x, y};
            if (!this.createBaseShield(this.redBase, 'red', this.baseOpenChoice)) {
                this.redBase = null;
                this.showMessage('该位置无法生成三面防护镜子，请换个位置', 'error');
                this.updateStatus();
                this.draw();
                return;
            }
            this.showMessage('红方基地已放置', 'success');
            this.currentPlayer = 'blue';
            if (this.aiEnabled && this.currentPlayer === this.aiPlayer) {
                this.aiPlaceBase();
                return;
            }
        } else {
            // 检查是否与红方基地相邻
            const dx = Math.abs(x - this.redBase.x);
            const dy = Math.abs(y - this.redBase.y);
            if (dx <= 1 && dy <= 1) {
                this.showMessage('基地不能与对方基地相邻', 'error');
                return;
            }
            
            this.blueBase = {x, y};
            if (!this.createBaseShield(this.blueBase, 'blue', this.baseOpenChoice)) {
                this.blueBase = null;
                this.showMessage('该位置无法生成三面防护镜子，请换个位置', 'error');
                this.updateStatus();
                this.draw();
                return;
            }
            this.showMessage('蓝方基地已放置，游戏开始！', 'success');
            this.gamePhase = 'placeMirrors';
            this.currentPlayer = 'red';
            
            // 检查是否需要AI行动
            if (this.aiEnabled && this.aiPlayer === 'red') {
                setTimeout(() => this.aiMove(), 500);
            }
        }
        
        this.updateStatus();
        this.draw();
    }

    aiPlaceBase() {
        const basePos = this.findAiBasePosition();
        if (!basePos) {
            this.showMessage('AI 无法放置基地，请手动放置', 'error');
            return;
        }

        if (this.currentPlayer === 'red') {
            this.redBase = basePos;
            const open = this.pickAiOpenSide(basePos, 'red');
            if (!this.createBaseShield(this.redBase, 'red', open)) {
                this.redBase = null;
                this.showMessage('AI 未能找到可放置的三面防护基地位置', 'error');
                return;
            }
            this.showMessage('AI 已放置红方基地', 'success');
            this.currentPlayer = 'blue';
        } else {
            this.blueBase = basePos;
            const open = this.pickAiOpenSide(basePos, 'blue');
            if (!this.createBaseShield(this.blueBase, 'blue', open)) {
                this.blueBase = null;
                this.showMessage('AI 未能找到可放置的三面防护基地位置', 'error');
                return;
            }
            this.showMessage('AI 已放置蓝方基地，游戏开始！', 'success');
            this.gamePhase = 'placeMirrors';
            this.currentPlayer = 'red';
        }

        this.updateStatus();
        this.draw();

        if (this.aiEnabled && this.gamePhase === 'placeMirrors' && this.currentPlayer === this.aiPlayer) {
            setTimeout(() => this.aiMove(), 500);
        }
    }

    findAiBasePosition() {
        const candidates = [];
        for (let x = 0; x < this.gridSize; x++) {
            for (let y = 0; y < this.gridSize; y++) {
                const pos = {x, y};
                if (!this.isBasePositionAllowed(pos)) continue;
                if (!this.canCreateShieldAt(pos, this.currentPlayer)) continue;
                candidates.push(pos);
            }
        }

        if (candidates.length === 0) return null;

        const center = { x: this.gridSize / 2, y: this.gridSize / 2 };

        if (this.currentPlayer === 'blue' && this.redBase) {
            // 远离对手优先，再次靠近中心平衡
            let best = null;
            let bestScore = -Infinity;
            for (const pos of candidates) {
                const dx = pos.x - this.redBase.x;
                const dy = pos.y - this.redBase.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const centerDist = Math.sqrt((pos.x - center.x) ** 2 + (pos.y - center.y) ** 2);
                const score = dist * 2 - centerDist * 0.3;
                if (score > bestScore) {
                    bestScore = score;
                    best = pos;
                }
            }
            return best;
        }

        // 红方：开局无对手时倾向中心稍偏随机，避免角落
        let best = null;
        let bestScore = -Infinity;
        for (const pos of candidates) {
            const centerDist = Math.sqrt((pos.x - center.x) ** 2 + (pos.y - center.y) ** 2);
            const edgeDist = Math.min(pos.x, pos.y, this.gridSize - pos.x, this.gridSize - pos.y);
            const score = -centerDist + edgeDist * 0.4 + Math.random() * 0.1;
            if (score > bestScore) {
                bestScore = score;
                best = pos;
            }
        }
        return best;
    }

    isBasePositionAllowed(pos) {
        const inRange = pos.x >= 0 && pos.x < this.gridSize && pos.y >= 0 && pos.y < this.gridSize;
        if (!inRange) return false;

        if (this.redBase && pos.x === this.redBase.x && pos.y === this.redBase.y) return false;
        if (this.blueBase && pos.x === this.blueBase.x && pos.y === this.blueBase.y) return false;

        if (this.currentPlayer === 'blue' && this.redBase) {
            const dx = Math.abs(pos.x - this.redBase.x);
            const dy = Math.abs(pos.y - this.redBase.y);
            if (dx <= 1 && dy <= 1) return false;
        }

        return true;
    }

    canCreateShieldAt(basePos, player, preferredOpen = null) {
        const edges = [
            {dir: 'top', a: {x: basePos.x, y: basePos.y}, b: {x: basePos.x + 1, y: basePos.y}},
            {dir: 'bottom', a: {x: basePos.x, y: basePos.y + 1}, b: {x: basePos.x + 1, y: basePos.y + 1}},
            {dir: 'left', a: {x: basePos.x, y: basePos.y}, b: {x: basePos.x, y: basePos.y + 1}},
            {dir: 'right', a: {x: basePos.x + 1, y: basePos.y}, b: {x: basePos.x + 1, y: basePos.y + 1}}
        ];

        const openList = preferredOpen ? edges.filter(e => e.dir === preferredOpen) : edges;

        for (const open of openList) {
            if (!this.isEdgeFree(open)) continue;
            const toPlace = edges.filter(e => e !== open);
            if (toPlace.every(edge => this.canPlaceShieldEdge(edge, player))) {
                return true;
            }
        }
        return false;
    }

    pickAiOpenSide(basePos, player) {
        const opponentBase = player === 'red' ? this.blueBase : this.redBase;
        const dirs = ['top', 'right', 'bottom', 'left'];
        if (!opponentBase) {
            for (const d of dirs) {
                if (this.canCreateShieldAt(basePos, player, d)) return d;
            }
            return null;
        }

        const dx = basePos.x - opponentBase.x;
        const dy = basePos.y - opponentBase.y;
        const scored = [
            {dir: 'top', score: dy >= 0 ? Math.abs(dy) : -Math.abs(dy)},
            {dir: 'bottom', score: dy <= 0 ? Math.abs(dy) : -Math.abs(dy)},
            {dir: 'left', score: dx >= 0 ? Math.abs(dx) : -Math.abs(dx)},
            {dir: 'right', score: dx <= 0 ? Math.abs(dx) : -Math.abs(dx)}
        ].sort((a, b) => b.score - a.score);

        for (const item of scored) {
            if (this.canCreateShieldAt(basePos, player, item.dir)) return item.dir;
        }
        for (const d of dirs) {
            if (this.canCreateShieldAt(basePos, player, d)) return d;
        }
        return null;
    }

    canPlaceShieldEdge(edge, player) {
        const mirror = {
            x1: edge.a.x,
            y1: edge.a.y,
            x2: edge.b.x,
            y2: edge.b.y,
            player
        };

        for (const m of this.mirrors) {
            if (this.mirrorsOverlapOrIntersect(mirror, m) || this.mirrorsProperIntersect(mirror, m)) {
                return false;
            }
        }
        return true;
    }

    isEdgeFree(edge) {
        return !this.mirrors.some(m => this.matchesEdge(m, edge));
    }

    matchesEdge(mirror, edge) {
        return (mirror.x1 === edge.a.x && mirror.y1 === edge.a.y && mirror.x2 === edge.b.x && mirror.y2 === edge.b.y) ||
               (mirror.x2 === edge.a.x && mirror.y2 === edge.a.y && mirror.x1 === edge.b.x && mirror.y1 === edge.b.y);
    }

    createBaseShield(base, player, preferredOpen = null) {
        const edges = [
            {dir: 'top', a: {x: base.x, y: base.y}, b: {x: base.x + 1, y: base.y}},
            {dir: 'bottom', a: {x: base.x, y: base.y + 1}, b: {x: base.x + 1, y: base.y + 1}},
            {dir: 'left', a: {x: base.x, y: base.y}, b: {x: base.x, y: base.y + 1}},
            {dir: 'right', a: {x: base.x + 1, y: base.y}, b: {x: base.x + 1, y: base.y + 1}}
        ];

        const openOrder = preferredOpen ? [preferredOpen] : ['top', 'bottom', 'left', 'right'];
        for (const openDir of openOrder) {
            const openEdge = edges.find(e => e.dir === openDir);
            if (!this.isEdgeFree(openEdge)) continue;

            const toPlace = edges.filter(e => e.dir !== openDir);
            if (toPlace.every(edge => this.canPlaceShieldEdge(edge, player))) {
                const newMirrors = toPlace.map(edge => ({
                    x1: edge.a.x,
                    y1: edge.a.y,
                    x2: edge.b.x,
                    y2: edge.b.y,
                    player
                }));
                this.mirrors.push(...newMirrors);
                this.baseOpenSide[player] = openDir;
                return true;
            }
        }

        return false;
    }
    
    placeMirror(point) {
        if (!this.selectedPoint) {
            // 选择第一个点
            this.selectedPoint = point;
            this.showMessage('请选择镜子的第二个端点', 'info');
        } else {
            // 选择第二个点，尝试放置镜子
            const mirror = {
                x1: this.selectedPoint.x,
                y1: this.selectedPoint.y,
                x2: point.x,
                y2: point.y,
                player: this.currentPlayer
            };
            
            if (this.isValidMirror(mirror)) {
                this.mirrors.push(mirror);
                this.moveHistory.push({
                    type: 'mirror',
                    mirror: {...mirror}
                });
                
                const prevPlayer = this.currentPlayer;
                this.currentPlayer = this.currentPlayer === 'red' ? 'blue' : 'red';
                this.showMessage('镜子已放置', 'success');

                // 记录到下回合开始检查，已有待检查则不覆盖
                if (!this.pendingWinCheck) {
                    this.pendingWinCheck = prevPlayer;
                }

                if (this.aiEnabled && this.aiPlayer === this.currentPlayer) {
                    setTimeout(() => this.aiMove(), 120);
                }
                // 若当前已轮到记录的进攻方，立即判定
                this.checkPendingWin();
            } else {
                this.showMessage('无效的镜子放置', 'error');
            }
            
            this.selectedPoint = null;
            this.updateStatus();
            this.draw();
        }
    }
    
    isValidMirror(mirror) {
        const {x1, y1, x2, y2} = mirror;
        
        // 检查两点是否相同
        if (x1 === x2 && y1 === y2) {
            return false;
        }
        
        // 检查是否为有效连接（格子边或对角线）
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        
        // 必须是相邻格点的连接
        if (dx > 1 || dy > 1) {
            return false;
        }
        
        // 检查是否占据了基地
        if ((this.redBase && this.isMirrorOnCell(mirror, this.redBase)) ||
            (this.blueBase && this.isMirrorOnCell(mirror, this.blueBase))) {
            return false;
        }

        // 保持基地开口：禁止在开口边放镜子
        if (this.baseOpenSide.red && this.redBase && this.isOnOpenEdge(mirror, this.redBase, this.baseOpenSide.red)) {
            this.showMessage('禁止封闭红方基地开口', 'warning');
            return false;
        }
        if (this.baseOpenSide.blue && this.blueBase && this.isOnOpenEdge(mirror, this.blueBase, this.baseOpenSide.blue)) {
            this.showMessage('禁止封闭蓝方基地开口', 'warning');
            return false;
        }
        
        // 检查是否与现有镜子重叠或交叉
        for (const existingMirror of this.mirrors) {
            if (this.mirrorsOverlapOrIntersect(mirror, existingMirror) || this.mirrorsProperIntersect(mirror, existingMirror)) {
                return false;
            }
        }
        
        // 检查是否会导致任一基地被四面镜子严密包围（不允许超过三面）
        const testMirrors = [...this.mirrors, mirror];
        if (this.isBaseStrictlyEnclosed('red', testMirrors) || this.isBaseStrictlyEnclosed('blue', testMirrors)) {
            this.showMessage('警告：基地四周最多允许三面镜子，不能被严密包围！', 'warning');
            return false;
        }
        
        return true;
    }
    
    isMirrorOnCell(mirror, cell) {
        const {x1, y1, x2, y2} = mirror;
        const {x, y} = cell;
        
        // 检查镜子的端点是否在格子的四个角上
        const corners = [
            {x, y}, {x: x+1, y}, {x, y: y+1}, {x: x+1, y: y+1}
        ];
        
        for (const corner of corners) {
            if ((x1 === corner.x && y1 === corner.y) || 
                (x2 === corner.x && y2 === corner.y)) {
                return true;
            }
        }
        
        return false;
    }

    isOnOpenEdge(mirror, base, openDir) {
        const edges = {
            top:   {a: {x: base.x, y: base.y}, b: {x: base.x + 1, y: base.y}},
            bottom:{a: {x: base.x, y: base.y + 1}, b: {x: base.x + 1, y: base.y + 1}},
            left:  {a: {x: base.x, y: base.y}, b: {x: base.x, y: base.y + 1}},
            right: {a: {x: base.x + 1, y: base.y}, b: {x: base.x + 1, y: base.y + 1}}
        };
        const edge = edges[openDir];
        if (!edge) return false;
        return this.matchesEdge(mirror, edge);
    }
    
    mirrorsOverlapOrIntersect(m1, m2) {
        // 检查是否完全重合
        if ((m1.x1 === m2.x1 && m1.y1 === m2.y1 && m1.x2 === m2.x2 && m1.y2 === m2.y2) ||
            (m1.x1 === m2.x2 && m1.y1 === m2.y2 && m1.x2 === m2.x1 && m1.y2 === m2.y1)) {
            return true;
        }
        
        // 检查是否共享端点并可能重叠
        const sharePoint = (
            (m1.x1 === m2.x1 && m1.y1 === m2.y1) ||
            (m1.x1 === m2.x2 && m1.y1 === m2.y2) ||
            (m1.x2 === m2.x1 && m1.y2 === m2.y1) ||
            (m1.x2 === m2.x2 && m1.y2 === m2.y2)
        );
        
        if (sharePoint) {
            // 如果共享端点，检查是否在同一条线上（这样就重叠了）
            const dx1 = m1.x2 - m1.x1;
            const dy1 = m1.y2 - m1.y1;
            const dx2 = m2.x2 - m2.x1;
            const dy2 = m2.y2 - m2.y1;
            
            // 方向相同或相反
            if ((dx1 === dx2 && dy1 === dy2) || (dx1 === -dx2 && dy1 === -dy2)) {
                return true;
            }
        }
        
        return false;
    }

    mirrorsProperIntersect(m1, m2) {
        // 排除共享端点的情况
        const sharesEndpoint = (
            (m1.x1 === m2.x1 && m1.y1 === m2.y1) ||
            (m1.x1 === m2.x2 && m1.y1 === m2.y2) ||
            (m1.x2 === m2.x1 && m1.y2 === m2.y1) ||
            (m1.x2 === m2.x2 && m1.y2 === m2.y2)
        );
        if (sharesEndpoint) return false;

        return this.segmentsIntersect(m1, m2);
    }

    segmentsIntersect(m1, m2) {
        const p1 = {x: m1.x1, y: m1.y1};
        const p2 = {x: m1.x2, y: m1.y2};
        const p3 = {x: m2.x1, y: m2.y1};
        const p4 = {x: m2.x2, y: m2.y2};

        const d1 = this.direction(p3, p4, p1);
        const d2 = this.direction(p3, p4, p2);
        const d3 = this.direction(p1, p2, p3);
        const d4 = this.direction(p1, p2, p4);

        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }

        return false;
    }

    direction(p1, p2, p3) {
        return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    }
    
    isBaseStrictlyEnclosed(player, mirrors) {
        const base = player === 'red' ? this.redBase : this.blueBase;
        if (!base) return false;

        const edges = [
            {a: {x: base.x, y: base.y}, b: {x: base.x + 1, y: base.y}},           // 上边
            {a: {x: base.x, y: base.y + 1}, b: {x: base.x + 1, y: base.y + 1}},   // 下边
            {a: {x: base.x, y: base.y}, b: {x: base.x, y: base.y + 1}},           // 左边
            {a: {x: base.x + 1, y: base.y}, b: {x: base.x + 1, y: base.y + 1}}    // 右边
        ];

        let covered = 0;
        for (const edge of edges) {
            if (mirrors.some(m => (
                (m.x1 === edge.a.x && m.y1 === edge.a.y && m.x2 === edge.b.x && m.y2 === edge.b.y) ||
                (m.x2 === edge.a.x && m.y2 === edge.a.y && m.x1 === edge.b.x && m.y1 === edge.b.y)
            ))) {
                covered++;
            }
        }

        return covered >= 4; // 四面全封为严密包围
    }
    
    checkWinCondition(attackerOverride = null) {
        // 以指定进攻方发射激光（用于“下一回合”判胜）
        const attacker = attackerOverride || this.currentPlayer;
        const defender = attacker === 'red' ? 'blue' : 'red';
        const attackerBase = attacker === 'red' ? this.redBase : this.blueBase;
        const defenderBase = defender === 'red' ? this.redBase : this.blueBase;

        if (!attackerBase || !defenderBase) return null;

        const directions = [
            {dx: 1, dy: 0},  // 右
            {dx: -1, dy: 0}, // 左
            {dx: 0, dy: 1},  // 下
            {dx: 0, dy: -1}  // 上
        ];

        const hitCell = (p, cell) => {
            const eps = 1e-6;
            return p.x >= cell.x - eps && p.x <= cell.x + 1 + eps &&
                   p.y >= cell.y - eps && p.y <= cell.y + 1 + eps;
        };

        // 先用矩形命中判定（与 AI 评估一致），再保存路径
        const canHit = canLaserHitBase(attackerBase, attacker, defenderBase, this.mirrors, this.gridSize);
        if (!canHit) return null;

        // 寻找任一方向的命中路径（同色镜子支持反射+透射分支）
        for (const dir of directions) {
            const laserPath = findLaserHitPath(attackerBase, dir, this.mirrors, attacker, defenderBase, this.gridSize);
            if (laserPath) {
                this.winningLaser = { base: attackerBase, direction: dir, path: laserPath };
                return attacker;
            }
        }

        return null;
    }

    checkPendingWin() {
        if (!this.pendingWinCheck || this.gamePhase !== 'placeMirrors' || this.gamePhase === 'gameOver') return false;
        // 仅在记录的进攻方重新轮到时才判胜（等待完整一轮）
        if (this.currentPlayer !== this.pendingWinCheck) return false;
        if (!this.redBase || !this.blueBase) { this.pendingWinCheck = null; return false; }
        const winner = this.checkWinCondition(this.pendingWinCheck);
        if (winner) {
            this.gamePhase = 'gameOver';
            this.winner = winner;
            this.updateStatus();
            setTimeout(() => this.drawWinningLaser(winner), 120);
            this.pendingWinCheck = null;
            return true;
        }
        this.pendingWinCheck = null;
        return false;
    }
    
    drawWinningLaser(winner) {
        if (!this.winningLaser) return;
        
        setTimeout(() => {
            this.draw();
            this.drawLaserPath(this.winningLaser.path, winner);
        }, 300);
    }
    
    aiMove() {
        if (this.gamePhase !== 'placeMirrors' || !this.aiEnabled) return;
        if (this.checkPendingWin()) return;
        
        this.aiThinking = true;
        this.aiThoughtMirror = null;
        this.draw();
        this.showMessage('AI思考中...', 'info');
        
        setTimeout(() => {
            let move = findBestMove(
                this.currentPlayer,
                this.redBase,
                this.blueBase,
                this.mirrors,
                this.gridSize
            );

            // 兜底：若无最佳招，则随机合法招，避免卡住
            if (!move) {
                move = findRandomMove(
                    this.currentPlayer,
                    this.redBase,
                    this.blueBase,
                    this.mirrors,
                    this.gridSize
                );
            }
            
            this.aiThinking = false;
            if (move) {
                this.aiThoughtMirror = move;
                setTimeout(() => {
                    this.aiThoughtMirror = null;
                    this.draw();
                }, 80);

                this.mirrors.push(move);
                this.moveHistory.push({
                    type: 'mirror',
                    mirror: {...move}
                });
                const prevPlayer = this.currentPlayer;
                this.currentPlayer = this.currentPlayer === 'red' ? 'blue' : 'red';
                this.showMessage('AI已放置镜子', 'success');

                // 记录待判胜的进攻方，等下回合开始检查；已有待检查则不覆盖
                if (!this.pendingWinCheck) {
                    this.pendingWinCheck = prevPlayer;
                }

                this.updateStatus();
                this.draw();

                // 若当前已轮到记录的进攻方，立即判定
                this.checkPendingWin();
            } else {
                // AI 无路可走，跳过回合
                this.showMessage('AI无可走步，回合跳过', 'warning');
                this.currentPlayer = this.currentPlayer === 'red' ? 'blue' : 'red';
                this.updateStatus();
                this.draw();

                // 若存在待检查胜利且已轮到对应方，立刻判定
                this.checkPendingWin();
            }
        }, 80);
    }
    
    toggleAI() {
        this.aiEnabled = !this.aiEnabled;
        const btn = document.getElementById('toggleAIBtn');
        btn.textContent = `AI: ${this.aiEnabled ? '开启 (蓝方)' : '关闭'}`;
        
        if (this.aiEnabled && this.gamePhase === 'placeMirrors' && 
            this.currentPlayer === this.aiPlayer) {
            setTimeout(() => this.aiMove(), 120);
        }

        if (this.aiEnabled && this.gamePhase === 'placeBase' && this.currentPlayer === this.aiPlayer) {
            setTimeout(() => this.aiPlaceBase(), 80);
        }
    }
    
    undo() {
        if (this.moveHistory.length === 0) return;
        
        const lastMove = this.moveHistory.pop();
        if (lastMove.type === 'mirror') {
            this.mirrors.pop();
            this.currentPlayer = this.currentPlayer === 'red' ? 'blue' : 'red';
            
            if (this.gamePhase === 'gameOver') {
                this.gamePhase = 'placeMirrors';
            }
            
            this.showMessage('已撤销上一步', 'info');
            this.updateStatus();
            this.draw();
        }
    }
    
    reset() {
        this.gamePhase = 'placeBase';
        this.currentPlayer = 'red';
        this.redBase = null;
        this.blueBase = null;
        this.mirrors = [];
        this.moveHistory = [];
        this.selectedPoint = null;
        this.hoverPoint = null;
        this.winningLaser = null;
        this.baseOpenSide = { red: null, blue: null };
        this.aiThinking = false;
        this.aiThoughtMirror = null;
        this.aiThinkingTrace = null;
        this.winner = null;
        this.pendingWinCheck = null; // 重置待检查的胜利状态
        
        this.setupCanvas();
        this.updateStatus();
        this.draw();
        this.showMessage('游戏已重置', 'info');

        if (this.aiEnabled && this.currentPlayer === this.aiPlayer) {
            setTimeout(() => this.aiPlaceBase(), 80);
        }
    }

    updateStatus() {
        const statusEl = document.getElementById('gameStatus');
        const playerEl = document.getElementById('currentPlayer');
        const phaseEl = document.getElementById('gamePhase');
        const undoBtn = document.getElementById('undoBtn');
        
        if (this.gamePhase === 'placeBase') {
            if (!this.redBase) {
                statusEl.textContent = '请红方放置基地';
                phaseEl.textContent = '基地放置';
            } else {
                statusEl.textContent = '请蓝方放置基地';
                phaseEl.textContent = '基地放置';
            }
        } else if (this.gamePhase === 'placeMirrors') {
            statusEl.textContent = '游戏进行中';
            phaseEl.textContent = '镜子放置';
        } else if (this.gamePhase === 'gameOver') {
            const winner = this.winner === 'red' ? '红方' : '蓝方';
            statusEl.textContent = `游戏结束 - ${winner}获胜`;
            phaseEl.textContent = '游戏结束';
        }
        
        const showSide = this.gamePhase === 'gameOver' && this.winner ? this.winner : this.currentPlayer;
        playerEl.textContent = showSide === 'red' ? '红方' : '蓝方';
        playerEl.className = `player-indicator ${showSide}`;
        
        undoBtn.disabled = this.moveHistory.length === 0 || this.gamePhase === 'gameOver';
    }
    
    showMessage(message, type = 'info') {
        const messageBox = document.getElementById('messageBox');
        messageBox.textContent = message;
        messageBox.className = `message-box ${type}`;
        
        // 自动清除消息
        setTimeout(() => {
            if (messageBox.textContent === message) {
                messageBox.textContent = '';
                messageBox.className = 'message-box';
            }
        }, 3000);
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制网格
        this.drawGrid();
        
        // 绘制基地（底层，不遮挡护盾线）
        this.drawBases();
        
        // 绘制镜子和护盾
        this.drawMirrors();
        
        // 绘制选中的点
        if (this.selectedPoint) {
            this.drawSelectedPoint(this.selectedPoint);
        }
        
        // 绘制悬停效果
        if (this.hoverPoint && this.gamePhase !== 'gameOver') {
            this.drawHoverPoint(this.hoverPoint);
        }
        
        // 绘制预览线
        if (this.selectedPoint && this.hoverPoint && this.gamePhase === 'placeMirrors') {
            this.drawPreviewMirror(this.selectedPoint, this.hoverPoint);
        }

        // AI 思考或落子可视化
        this.drawAiOverlay();
    }
    
    drawGrid() {
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        
        // 绘制竖线
        for (let i = 0; i <= this.gridSize; i++) {
            const x = this.padding + i * this.cellSize;
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.padding);
            this.ctx.lineTo(x, this.padding + this.gridSize * this.cellSize);
            this.ctx.stroke();
        }
        
        // 绘制横线
        for (let i = 0; i <= this.gridSize; i++) {
            const y = this.padding + i * this.cellSize;
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding, y);
            this.ctx.lineTo(this.padding + this.gridSize * this.cellSize, y);
            this.ctx.stroke();
        }
        
        // 绘制格点
        this.ctx.fillStyle = '#999';
        for (let i = 0; i <= this.gridSize; i++) {
            for (let j = 0; j <= this.gridSize; j++) {
                const x = this.padding + i * this.cellSize;
                const y = this.padding + j * this.cellSize;
                this.ctx.beginPath();
                this.ctx.arc(x, y, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
    }
    
    drawBases() {
        if (this.redBase) {
            this.drawBase(this.redBase, '#ff6b6b', 'red');
        }
        if (this.blueBase) {
            this.drawBase(this.blueBase, '#4dabf7', 'blue');
        }
    }
    
    drawBase(base, color, player) {
        const x = this.padding + base.x * this.cellSize;
        const y = this.padding + base.y * this.cellSize;
        const open = this.baseOpenSide[player];
        
        // 基地填充
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillRect(x, y, this.cellSize, this.cellSize);
        this.ctx.globalAlpha = 1;
        
        // 只画三条边，开口方向留空
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        const edges = {
            top:    {move: [x, y], line: [x + this.cellSize, y]},
            bottom: {move: [x, y + this.cellSize], line: [x + this.cellSize, y + this.cellSize]},
            left:   {move: [x, y], line: [x, y + this.cellSize]},
            right:  {move: [x + this.cellSize, y], line: [x + this.cellSize, y + this.cellSize]}
        };
        Object.entries(edges).forEach(([dir, pts]) => {
            if (open && dir === open) return; // 保持开口
            this.ctx.beginPath();
            this.ctx.moveTo(...pts.move);
            this.ctx.lineTo(...pts.line);
            this.ctx.stroke();
        });
        
        // 绘制X标记
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 3, y + 3);
        this.ctx.lineTo(x + this.cellSize - 3, y + this.cellSize - 3);
        this.ctx.moveTo(x + this.cellSize - 3, y + 3);
        this.ctx.lineTo(x + 3, y + this.cellSize - 3);
        this.ctx.stroke();
    }
    
    drawMirrors() {
        for (const mirror of this.mirrors) {
            this.drawMirror(mirror);
        }
    }
    
    drawMirror(mirror) {
        const x1 = this.padding + mirror.x1 * this.cellSize;
        const y1 = this.padding + mirror.y1 * this.cellSize;
        const x2 = this.padding + mirror.x2 * this.cellSize;
        const y2 = this.padding + mirror.y2 * this.cellSize;
        
        const color = mirror.player === 'red' ? '#ff6b6b' : '#4dabf7';
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        
        // 绘制端点
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x1, y1, 4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x2, y2, 4, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    drawPreviewMirror(p1, p2) {
        const x1 = this.padding + p1.x * this.cellSize;
        const y1 = this.padding + p1.y * this.cellSize;
        const x2 = this.padding + p2.x * this.cellSize;
        const y2 = this.padding + p2.y * this.cellSize;
        
        const color = this.currentPlayer === 'red' ? '#ff6b6b' : '#4dabf7';
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.globalAlpha = 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.globalAlpha = 1;
    }
    
    drawSelectedPoint(point) {
        const x = this.padding + point.x * this.cellSize;
        const y = this.padding + point.y * this.cellSize;
        
        this.ctx.strokeStyle = this.currentPlayer === 'red' ? '#ff6b6b' : '#4dabf7';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 8, 0, Math.PI * 2);
        this.ctx.stroke();
    }
    
    drawHoverPoint(point) {
        const x = this.padding + point.x * this.cellSize;
        const y = this.padding + point.y * this.cellSize;
        
        this.ctx.fillStyle = this.currentPlayer === 'red' ? '#ff6b6b' : '#4dabf7';
        this.ctx.globalAlpha = 0.3;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
    }
    
    drawLaserPath(path, player) {
        if (!path || path.length === 0) return;
        
        const color = player === 'red' ? '#ff6b6b' : '#4dabf7';
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 10;
        this.ctx.globalAlpha = 0.8;
        
        this.ctx.beginPath();
        for (let i = 0; i < path.length; i++) {
            const x = this.padding + path[i].x * this.cellSize;
            const y = this.padding + path[i].y * this.cellSize;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();
        
        this.ctx.shadowBlur = 0;
        this.ctx.globalAlpha = 1;
    }

    drawAiOverlay() {
        // 思考提示面板
        if (this.aiThinking || (this.aiThinkingTrace && this.aiThinkingTrace.length)) {
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(0,0,0,0.45)';
            const panelWidth = 260;
            const lineHeight = 18;
            const rows = 1 + (this.aiThinkingTrace ? this.aiThinkingTrace.length : 0);
            const panelHeight = 16 + rows * lineHeight + 8;
            this.ctx.fillRect(10, 10, panelWidth, panelHeight);

            this.ctx.fillStyle = '#22d3ee';
            this.ctx.font = '14px Segoe UI, sans-serif';
            this.ctx.fillText(this.aiThinking ? 'AI 思考中...' : 'AI 候选评估', 16, 30);

            if (this.aiThinkingTrace) {
                this.ctx.font = '12px Segoe UI, sans-serif';
                this.aiThinkingTrace.forEach((item, idx) => {
                    const y = 30 + lineHeight * (idx + 1);
                    const tag = `#${idx + 1} 评分 ${item.score.toFixed(1)}`;
                    const reason = item.reasons.slice(0, 2).join('，');
                    this.ctx.fillStyle = '#e2e8f0';
                    this.ctx.fillText(`${tag}: ${reason}`, 16, y);
                });
            }

            this.ctx.restore();
        }

        // 高亮 AI 候选镜子（前几个）
        if (this.aiThinkingTrace && this.aiThinkingTrace.length) {
            const colors = ['rgba(34,211,238,0.9)', 'rgba(34,211,238,0.55)', 'rgba(34,211,238,0.35)', 'rgba(34,211,238,0.25)'];
            this.aiThinkingTrace.forEach((item, idx) => {
                const m = item.mirror;
                const x1 = this.padding + m.x1 * this.cellSize;
                const y1 = this.padding + m.y1 * this.cellSize;
                const x2 = this.padding + m.x2 * this.cellSize;
                const y2 = this.padding + m.y2 * this.cellSize;
                this.ctx.save();
                this.ctx.strokeStyle = colors[idx] || colors[colors.length - 1];
                this.ctx.lineWidth = idx === 0 ? 4 : 2;
                this.ctx.setLineDash(idx === 0 ? [8, 4] : [6, 6]);
                this.ctx.shadowColor = '#22d3ee';
                this.ctx.shadowBlur = idx === 0 ? 10 : 4;
                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.stroke();
                this.ctx.restore();
            });
        }

        // 最终选择的镜子高亮（落子前）
        if (this.aiThoughtMirror) {
            const m = this.aiThoughtMirror;
            const x1 = this.padding + m.x1 * this.cellSize;
            const y1 = this.padding + m.y1 * this.cellSize;
            const x2 = this.padding + m.x2 * this.cellSize;
            const y2 = this.padding + m.y2 * this.cellSize;
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(16,185,129,0.9)';
            this.ctx.lineWidth = 4;
            this.ctx.setLineDash([10, 4]);
            this.ctx.shadowColor = '#10b981';
            this.ctx.shadowBlur = 14;
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
            this.ctx.restore();
        }
    }
}

// 启动游戏与主页交互
let game;

function startGame() {
    console.log('[LaserChess] startGame invoked');
    const homeView = document.getElementById('homeView');
    const gameView = document.getElementById('gameView');
    const homeGridSize = document.getElementById('homeGridSize');
    const homeMode = document.getElementById('homeMode');
    if (!homeGridSize || !homeMode || !homeView || !gameView) {
        console.error('[LaserChess] missing DOM nodes for start');
        return;
    }

    // 若尚未初始化游戏实例，立即创建
    if (!game) {
        game = new LaserChessGame();
    }

    const size = parseInt(homeGridSize.value);
    const aiOn = homeMode.value === 'ai';
    const openSelect = document.getElementById('openSideSelect');
    if (openSelect) {
        game.baseOpenChoice = openSelect.value;
    }

    // 同步到游戏控件
    const inGameSize = document.getElementById('gridSize');
    if (inGameSize) {
        inGameSize.value = String(size);
    }
    game.gridSize = size;
    game.reset();

    game.aiEnabled = aiOn;
    const aiBtn = document.getElementById('toggleAIBtn');
    if (aiBtn) {
        aiBtn.textContent = `AI: ${aiOn ? '开启 (蓝方)' : '关闭'}`;
    }

    homeView.classList.add('hidden');
    gameView.classList.remove('hidden');
    console.log('[LaserChess] switched to game view');

    // 如需 AI 先手，在重置后触发
    if (game.aiEnabled && game.currentPlayer === game.aiPlayer && game.gamePhase === 'placeBase') {
        setTimeout(() => game.aiPlaceBase(), 80);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('[LaserChess] DOMContentLoaded');
    try {
        game = new LaserChessGame();
    } catch (err) {
        alert('初始化失败: ' + err);
        console.error(err);
    }

    const startBtn = document.getElementById('startGameBtn');
    if (startBtn) {
        startBtn.addEventListener('click', startGame);
    }

    // 委托式兜底，避免按钮事件绑定失效
    document.body.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'startGameBtn') {
            e.preventDefault();
            console.log('[LaserChess] delegated start click');
            startGame();
        }
    });
});

// 提供全局访问，防止事件绑定失败时仍可触发
window.startGame = startGame;
