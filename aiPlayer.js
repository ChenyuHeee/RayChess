// AI玩家算法
// 实现简单的启发式AI

function findBestMove(player, redBase, blueBase, mirrors, gridSize) {
    const myBase = player === 'red' ? redBase : blueBase;
    const opponentBase = player === 'red' ? blueBase : redBase;
    
    // 获取所有可能的镜子放置
    const possibleMirrors = getAllPossibleMirrors(player, redBase, blueBase, mirrors, gridSize);
    
    if (possibleMirrors.length === 0) {
        return null;
    }
    
    // 评估每个可能的移动
    let bestMove = null;
    let bestScore = -Infinity;
    
    for (const mirror of possibleMirrors) {
        const score = evaluateMove(mirror, player, myBase, opponentBase, mirrors, gridSize);
        
        if (score > bestScore) {
            bestScore = score;
            bestMove = mirror;
        }
    }
    
    return bestMove;
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
        score += 1000; // 非常重要：阻止了对手的获胜路径
    }
    
    // 2. 进攻分数：检查这个镜子是否能帮助我的激光击中对手
    const beforeAttack = canLaserHitBase(myBase, player, opponentBase, existingMirrors, gridSize);
    const afterAttack = canLaserHitBase(myBase, player, opponentBase, testMirrors, gridSize);
    
    if (!beforeAttack && afterAttack) {
        score += 800; // 很重要：创造了获胜路径
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
    
    // 8. 添加一些随机性，避免AI太可预测
    score += Math.random() * 5;
    
    return score;
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
        score += 1000;
        reasons.push('阻挡对手激光');
    }

    const beforeAttack = canLaserHitBase(myBase, player, opponentBase, existingMirrors, gridSize);
    const afterAttack = canLaserHitBase(myBase, player, opponentBase, testMirrors, gridSize);
    if (!beforeAttack && afterAttack) {
        score += 800;
        reasons.push('创造进攻路径');
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

    const jitter = Math.random() * 5;
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
