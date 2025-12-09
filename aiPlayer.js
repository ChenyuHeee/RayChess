// AI玩家算法
// 重新设计：优先立即胜利/防守，其次 2-ply 稳健搜索，限制候选数量以保证性能

function findBestMove(player, redBase, blueBase, mirrors, gridSize) {
    const myBase = player === 'red' ? redBase : blueBase;
    const opponentBase = player === 'red' ? blueBase : redBase;
    const opponent = player === 'red' ? 'blue' : 'red';

    let candidates = getAllPossibleMirrors(player, redBase, blueBase, mirrors, gridSize);
    // 粗筛：优先中心/靠近对手的候选，避免全量搜索卡死
    if (candidates.length > 400) {
        const center = gridSize / 2;
        candidates = candidates
            .map((m) => {
                const avgX = (m.x1 + m.x2) / 2;
                const avgY = (m.y1 + m.y2) / 2;
                const centerDist = Math.hypot(avgX - center, avgY - center);
                const opp = opponentBase || { x: center, y: center };
                const oppDist = Math.hypot(avgX - opp.x - 0.5, avgY - opp.y - 0.5);
                const score = (gridSize - centerDist) * 1.2 + (gridSize - oppDist) * 0.6 + Math.random() * 0.1;
                return { m, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 400)
            .map((item) => item.m);
    }
    if (candidates.length === 0) return null;

    // 1) 若存在直接获胜招，立即出手
    for (const mirror of candidates) {
        const testMirrors = [...mirrors, mirror];
        if (canLaserHitBase(myBase, player, opponentBase, testMirrors, gridSize)) {
            return mirror;
        }
    }

    // 2) 若己方当前已被击杀威胁，先找能化解的防守手
    const underThreat = canLaserHitBase(opponentBase, opponent, myBase, mirrors, gridSize);
    if (underThreat) {
        const defensive = candidates.filter((mirror) => {
            const testMirrors = [...mirrors, mirror];
            return !canLaserHitBase(opponentBase, opponent, myBase, testMirrors, gridSize);
        });
        if (defensive.length > 0) {
            return pickBestByTwoPly(defensive, player, redBase, blueBase, mirrors, gridSize);
        }
    }

    // 3) 常规 2-ply 搜索（带候选裁剪）
    return pickBestByTwoPly(candidates, player, redBase, blueBase, mirrors, gridSize);
}

// 带评估明细的搜索，便于可视化
function findBestMoveWithTrace(player, redBase, blueBase, mirrors, gridSize) {
    const opponent = player === 'red' ? 'blue' : 'red';
    const myBase = player === 'red' ? redBase : blueBase;
    const opponentBase = player === 'red' ? blueBase : redBase;

    const possibleMirrors = getAllPossibleMirrors(player, redBase, blueBase, mirrors, gridSize);
    if (possibleMirrors.length === 0) return null;

    const evaluations = [];
    let bestMove = null;
    let bestScore = -Infinity;

    for (const mirror of possibleMirrors) {
        const detail = evaluateMoveDetailed(mirror, player, myBase, opponentBase, mirrors, gridSize);
        evaluations.push({ mirror, score: detail.score, reasons: detail.reasons });
        if (detail.score > bestScore) {
            bestScore = detail.score;
            bestMove = mirror;
        }
    }

    evaluations.sort((a, b) => b.score - a.score);

    return { bestMove, evaluations };
}

function evaluateMove(mirror, player, myBase, opponentBase, existingMirrors, gridSize) {
    let score = 0;
    const testMirrors = [...existingMirrors, mirror];
    
    // 1. 防守分数：检查这个镜子是否能阻止对手的激光
    const opponent = player === 'red' ? 'blue' : 'red';
    const beforeDefense = canLaserHitBase(opponentBase, opponent, myBase, existingMirrors, gridSize);
    const afterDefense = canLaserHitBase(opponentBase, opponent, myBase, testMirrors, gridSize);
    
    if (beforeDefense && !afterDefense) {
        score += 3000; // 阻止对手现有的获胜路径
    }
    
    // 2. 进攻分数：检查这个镜子是否能帮助我的激光击中对手
    const beforeAttack = canLaserHitBase(myBase, player, opponentBase, existingMirrors, gridSize);
    const afterAttack = canLaserHitBase(myBase, player, opponentBase, testMirrors, gridSize);
    
    if (!beforeAttack && afterAttack) {
        score += 5000; // 创造直接获胜路径
    }

    // 2.5 走坏：原本安全但落子后被打败
    const newlyExposed = !beforeDefense && afterDefense;
    if (newlyExposed) {
        score -= 2000; // 避免自杀式走法
    }
    
    // 3. 位置分数：靠近中心的位置更有价值
    const centerX = gridSize / 2;
    const centerY = gridSize / 2;
    const avgX = (mirror.x1 + mirror.x2) / 2;
    const avgY = (mirror.y1 + mirror.y2) / 2;
    const distToCenter = Math.sqrt(
        Math.pow(avgX - centerX, 2) + 
        Math.pow(avgY - centerY, 2)
    );
    score += (gridSize - distToCenter) * 2;
    
    // 4. 保护基地：靠近自己基地的镜子可以提供保护
    const distToMyBase = Math.sqrt(
        Math.pow(avgX - myBase.x - 0.5, 2) + 
        Math.pow(avgY - myBase.y - 0.5, 2)
    );
    
    if (distToMyBase < 5) {
        score += 100; // 靠近自己基地
    }
    
    // 5. 威胁对手：靠近对手基地的镜子可以增加压力
    const distToOpponentBase = Math.sqrt(
        Math.pow(avgX - opponentBase.x - 0.5, 2) + 
        Math.pow(avgY - opponentBase.y - 0.5, 2)
    );
    
    if (distToOpponentBase < 5) {
        score += 50; // 靠近对手基地
    }
    
    // 6. 镜子方向：对角线镜子通常更有用（可以改变激光方向）
    if (mirror.x1 !== mirror.x2 && mirror.y1 !== mirror.y2) {
        score += 20; // 对角线镜子
    }
    
    // 7. 连接性：与现有镜子连接的镜子可以形成组合
    let connections = 0;
    for (const existing of existingMirrors) {
        if (existing.player === player) {
            if ((existing.x1 === mirror.x1 && existing.y1 === mirror.y1) ||
                (existing.x1 === mirror.x2 && existing.y1 === mirror.y2) ||
                (existing.x2 === mirror.x1 && existing.y2 === mirror.y1) ||
                (existing.x2 === mirror.x2 && existing.y2 === mirror.y2)) {
                connections++;
            }
        }
    }
    score += connections * 10;
    
    // 8. 少量随机性，避免完全固定
    score += Math.random();
    
    return score;
}

// 2-ply 选优：对每个己方候选，枚举对方回应（裁剪），选择最小化对方得分的方案
function pickBestByTwoPly(candidates, player, redBase, blueBase, mirrors, gridSize, timeBudgetMs = 500) {
    const opponent = player === 'red' ? 'blue' : 'red';
    const myBase = player === 'red' ? redBase : blueBase;
    const opponentBase = player === 'red' ? blueBase : redBase;

    const deadline = Date.now() + timeBudgetMs;

    // 预估分并裁剪候选，避免爆炸
    const scored = candidates.map((m) => ({
        mirror: m,
        score: evaluateMove(m, player, myBase, opponentBase, mirrors, gridSize)
    }));
    scored.sort((a, b) => b.score - a.score);
    const topK = scored.slice(0, Math.min(50, scored.length));

    let bestMove = topK[0].mirror;
    let bestValue = -Infinity;

    for (const item of topK) {
        const testMirrors = [...mirrors, item.mirror];
        const myValue = evaluatePositionQuick(player, redBase, blueBase, testMirrors, gridSize);

        // 对手的最优反击（取前 30 个高分回应）
        const oppCandidates = getAllPossibleMirrors(opponent, redBase, blueBase, testMirrors, gridSize);
        if (oppCandidates.length === 0) {
            const value = myValue;
            if (value > bestValue) {
                bestValue = value;
                bestMove = item.mirror;
            }
            continue;
        }

        const oppScored = oppCandidates.map((m) => ({
            mirror: m,
            score: evaluateMove(m, opponent, opponentBase, myBase, testMirrors, gridSize)
        }));
        oppScored.sort((a, b) => b.score - a.score);
        const oppTop = oppScored.slice(0, Math.min(15, oppScored.length));

        let worstResponse = Infinity;
        for (const opp of oppTop) {
            if (Date.now() > deadline) break;
            const oppMirrors = [...testMirrors, opp.mirror];
            const oppVal = evaluatePositionQuick(player, redBase, blueBase, oppMirrors, gridSize);
            if (oppVal < worstResponse) {
                worstResponse = oppVal;
            }
        }

        // 目标：最大化在最坏回应下的评分
        const minimaxValue = Math.min(myValue, worstResponse);
        if (minimaxValue > bestValue) {
            bestValue = minimaxValue;
            bestMove = item.mirror;
        }

        if (Date.now() > deadline) break;
    }

    return bestMove;
}

function evaluatePositionQuick(povPlayer, redBase, blueBase, mirrors, gridSize) {
    const myBase = povPlayer === 'red' ? redBase : blueBase;
    const oppBase = povPlayer === 'red' ? blueBase : redBase;
    const opponent = povPlayer === 'red' ? 'blue' : 'red';

    if (!myBase || !oppBase) return 0;

    // 直接胜负优先
    if (canLaserHitBase(myBase, povPlayer, oppBase, mirrors, gridSize)) return 100000;
    if (canLaserHitBase(oppBase, opponent, myBase, mirrors, gridSize)) return -100000;

    // 简单位置分：距离中心 + 连接度
    let posScore = 0;
    const center = gridSize / 2;
    for (const m of mirrors) {
        const avgX = (m.x1 + m.x2) / 2;
        const avgY = (m.y1 + m.y2) / 2;
        const dist = Math.sqrt((avgX - center) ** 2 + (avgY - center) ** 2);
        const centerScore = (gridSize - dist) * 0.5;
        if (m.player === povPlayer) posScore += centerScore; else posScore -= centerScore * 0.2;
    }

    // 避免被包围：对己方基地周边镜子过多做轻微惩罚
    const aroundMyBase = mirrors.filter((m) => isMirrorOnCell(m, myBase)).length;
    posScore -= aroundMyBase * 30;

    return posScore;
}

// 评估并返回原因，供可视化使用
function evaluateMoveDetailed(mirror, player, myBase, opponentBase, existingMirrors, gridSize) {
    let score = 0;
    const reasons = [];
    const testMirrors = [...existingMirrors, mirror];

    const opponent = player === 'red' ? 'blue' : 'red';
    const beforeDefense = canLaserHitBase(opponentBase, opponent, myBase, existingMirrors, gridSize);
    const afterDefense = canLaserHitBase(opponentBase, opponent, myBase, testMirrors, gridSize);
    if (beforeDefense && !afterDefense) {
        score += 3000;
        reasons.push('阻挡对手激光');
    }

    const beforeAttack = canLaserHitBase(myBase, player, opponentBase, existingMirrors, gridSize);
    const afterAttack = canLaserHitBase(myBase, player, opponentBase, testMirrors, gridSize);
    if (!beforeAttack && afterAttack) {
        score += 5000;
        reasons.push('创造进攻路径');
    }

    const newlyExposed = !beforeDefense && afterDefense;
    if (newlyExposed) {
        score -= 2000;
        reasons.push('暴露己方基地');
    }

    const centerX = gridSize / 2;
    const centerY = gridSize / 2;
    const avgX = (mirror.x1 + mirror.x2) / 2;
    const avgY = (mirror.y1 + mirror.y2) / 2;
    const distToCenter = Math.sqrt(Math.pow(avgX - centerX, 2) + Math.pow(avgY - centerY, 2));
    const centerScore = (gridSize - distToCenter) * 2;
    score += centerScore;
    reasons.push(`靠近中心 +${centerScore.toFixed(1)}`);

    const distToMyBase = Math.sqrt(Math.pow(avgX - myBase.x - 0.5, 2) + Math.pow(avgY - myBase.y - 0.5, 2));
    if (distToMyBase < 5) {
        score += 100;
        reasons.push('保护己基地');
    }

    const distToOpponentBase = Math.sqrt(Math.pow(avgX - opponentBase.x - 0.5, 2) + Math.pow(avgY - opponentBase.y - 0.5, 2));
    if (distToOpponentBase < 5) {
        score += 50;
        reasons.push('施压对手基地');
    }

    if (mirror.x1 !== mirror.x2 && mirror.y1 !== mirror.y2) {
        score += 20;
        reasons.push('对角线镜子');
    }

    let connections = 0;
    for (const existing of existingMirrors) {
        if (existing.player === player) {
            if ((existing.x1 === mirror.x1 && existing.y1 === mirror.y1) ||
                (existing.x1 === mirror.x2 && existing.y1 === mirror.y2) ||
                (existing.x2 === mirror.x1 && existing.y2 === mirror.y1) ||
                (existing.x2 === mirror.x2 && existing.y2 === mirror.y2)) {
                connections++;
            }
        }
    }
    if (connections > 0) {
        score += connections * 10;
        reasons.push(`连接己方镜子 +${connections * 10}`);
    }

    const jitter = Math.random();
    score += jitter;
    reasons.push('少量随机性');

    return { score, reasons };
}

// 简化版AI：随机选择合法移动
function findRandomMove(player, redBase, blueBase, mirrors, gridSize) {
    const possibleMirrors = getAllPossibleMirrors(player, redBase, blueBase, mirrors, gridSize);
    
    if (possibleMirrors.length === 0) {
        return null;
    }
    
    const randomIndex = Math.floor(Math.random() * possibleMirrors.length);
    return possibleMirrors[randomIndex];
}

// 中级AI：使用蒙特卡洛树搜索的简化版本
function findMonteCarloMove(player, redBase, blueBase, mirrors, gridSize, simulations = 100) {
    const opponent = player === 'red' ? 'blue' : 'red';
    const possibleMirrors = getAllPossibleMirrors(player, redBase, blueBase, mirrors, gridSize);
    
    if (possibleMirrors.length === 0) {
        return null;
    }
    
    let bestMove = null;
    let bestWinRate = -1;
    
    for (const mirror of possibleMirrors) {
        let wins = 0;
        
        for (let i = 0; i < simulations; i++) {
            const result = simulateGame(
                player,
                mirror,
                redBase,
                blueBase,
                mirrors,
                gridSize
            );
            
            if (result === player) {
                wins++;
            }
        }
        
        const winRate = wins / simulations;
        
        if (winRate > bestWinRate) {
            bestWinRate = winRate;
            bestMove = mirror;
        }
    }
    
    return bestMove;
}

function simulateGame(startPlayer, firstMove, redBase, blueBase, startMirrors, gridSize, maxMoves = 20) {
    let mirrors = [...startMirrors, firstMove];
    let currentPlayer = startPlayer === 'red' ? 'blue' : 'red';
    let moves = 1;
    
    while (moves < maxMoves) {
        // 检查是否有人获胜
        const redWins = canLaserHitBase(redBase, 'red', blueBase, mirrors, gridSize);
        const blueWins = canLaserHitBase(blueBase, 'blue', redBase, mirrors, gridSize);
        
        if (redWins) return 'red';
        if (blueWins) return 'blue';
        
        // 随机下一步
        const move = findRandomMove(currentPlayer, redBase, blueBase, mirrors, gridSize);
        
        if (!move) {
            break; // 没有合法移动
        }
        
        mirrors.push(move);
        currentPlayer = currentPlayer === 'red' ? 'blue' : 'red';
        moves++;
    }
    
    // 游戏没有结束，返回平局或基于位置的评估
    return null;
}

// 高级AI：使用极小化极大算法
function findMinimaxMove(player, redBase, blueBase, mirrors, gridSize, depth = 3) {
    const possibleMirrors = getAllPossibleMirrors(player, redBase, blueBase, mirrors, gridSize);
    
    if (possibleMirrors.length === 0) {
        return null;
    }
    
    let bestMove = null;
    let bestValue = -Infinity;
    
    for (const mirror of possibleMirrors) {
        const value = minimax(
            player,
            false,
            depth - 1,
            redBase,
            blueBase,
            [...mirrors, mirror],
            gridSize,
            -Infinity,
            Infinity
        );
        
        if (value > bestValue) {
            bestValue = value;
            bestMove = mirror;
        }
    }
    
    return bestMove;
}

function minimax(player, isMaximizing, depth, redBase, blueBase, mirrors, gridSize, alpha, beta) {
    // 终止条件
    if (depth === 0) {
        return evaluatePosition(player, redBase, blueBase, mirrors, gridSize);
    }
    
    const currentPlayer = isMaximizing ? player : (player === 'red' ? 'blue' : 'red');
    const possibleMirrors = getAllPossibleMirrors(currentPlayer, redBase, blueBase, mirrors, gridSize);
    
    if (possibleMirrors.length === 0) {
        return evaluatePosition(player, redBase, blueBase, mirrors, gridSize);
    }
    
    if (isMaximizing) {
        let maxValue = -Infinity;
        
        for (const mirror of possibleMirrors) {
            const value = minimax(
                player,
                false,
                depth - 1,
                redBase,
                blueBase,
                [...mirrors, mirror],
                gridSize,
                alpha,
                beta
            );
            
            maxValue = Math.max(maxValue, value);
            alpha = Math.max(alpha, value);
            
            if (beta <= alpha) {
                break; // Beta剪枝
            }
        }
        
        return maxValue;
    } else {
        let minValue = Infinity;
        
        for (const mirror of possibleMirrors) {
            const value = minimax(
                player,
                true,
                depth - 1,
                redBase,
                blueBase,
                [...mirrors, mirror],
                gridSize,
                alpha,
                beta
            );
            
            minValue = Math.min(minValue, value);
            beta = Math.min(beta, value);
            
            if (beta <= alpha) {
                break; // Alpha剪枝
            }
        }
        
        return minValue;
    }
}

function evaluatePosition(player, redBase, blueBase, mirrors, gridSize) {
    const opponent = player === 'red' ? 'blue' : 'red';
    const myBase = player === 'red' ? redBase : blueBase;
    const opponentBase = player === 'red' ? blueBase : redBase;
    
    let score = 0;
    
    // 检查获胜条件
    if (canLaserHitBase(myBase, player, opponentBase, mirrors, gridSize)) {
        score += 10000; // 我可以获胜
    }
    
    if (canLaserHitBase(opponentBase, opponent, myBase, mirrors, gridSize)) {
        score -= 10000; // 对手可以获胜
    }
    
    // 统计己方和对方的镜子数量
    const myMirrors = mirrors.filter(m => m.player === player).length;
    const opponentMirrors = mirrors.filter(m => m.player === opponent).length;
    
    score += (myMirrors - opponentMirrors) * 10;
    
    return score;
}
