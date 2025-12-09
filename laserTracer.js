// 激光追踪算法
// 追踪激光路径，处理反射和透射

function traceLaser(base, direction, mirrors, laserColor, gridSize, maxSteps = 10000) {
    const path = [];
    let pos = {x: base.x + 0.5, y: base.y + 0.5}; // 从基地中心发射
    let dir = {dx: direction.dx, dy: direction.dy};
    let steps = 0;
    
    path.push({...pos});
    
    while (steps < maxSteps) {
        steps++;
        
        // 移动一小步
        const stepSize = 0.01;
        pos.x += dir.dx * stepSize;
        pos.y += dir.dy * stepSize;
        
        // 检查是否出界
        if (pos.x < 0 || pos.x > gridSize || pos.y < 0 || pos.y > gridSize) {
            break;
        }
        
        // 检查是否碰到镜子
        const collision = checkLaserMirrorCollision(pos, dir, mirrors, laserColor);
        
        if (collision) {
            path.push({...collision.point});
            
            if (collision.type === 'reflect') {
                // 只反射，改变方向
                dir = collision.newDirection;
                pos = {...collision.point};
            } else if (collision.type === 'both') {
                // 既反射又透射，这里选择反射路径
                // 实际游戏中可能需要追踪两条路径
                dir = collision.reflectDirection;
                pos = {...collision.point};
            }
            
            // 避免在同一点上重复碰撞
            pos.x += dir.dx * stepSize * 2;
            pos.y += dir.dy * stepSize * 2;
        }
        
        // 每隔一定距离记录路径点
        if (steps % 10 === 0) {
            path.push({...pos});
        }
    }
    
    return path;
}

function checkLaserMirrorCollision(pos, dir, mirrors, laserColor) {
    const tolerance = 0.05; // 碰撞检测容差
    
    for (const mirror of mirrors) {
        // 计算激光与镜子线段的交点
        const intersection = lineSegmentIntersection(
            pos,
            {x: pos.x + dir.dx, y: pos.y + dir.dy},
            {x: mirror.x1, y: mirror.y1},
            {x: mirror.x2, y: mirror.y2}
        );
        
        if (intersection && intersection.onSegment) {
            const distance = Math.sqrt(
                Math.pow(intersection.x - pos.x, 2) + 
                Math.pow(intersection.y - pos.y, 2)
            );
            
            if (distance < tolerance) {
                continue; // 太近了，可能是刚离开这个镜子
            }
            
            // 计算反射方向
            const mirrorVec = {
                x: mirror.x2 - mirror.x1,
                y: mirror.y2 - mirror.y1
            };
            
            const mirrorLen = Math.sqrt(mirrorVec.x * mirrorVec.x + mirrorVec.y * mirrorVec.y);
            mirrorVec.x /= mirrorLen;
            mirrorVec.y /= mirrorLen;
            
            // 计算入射向量在镜子法线上的投影
            const normal = {x: -mirrorVec.y, y: mirrorVec.x};
            const dotProduct = dir.dx * normal.x + dir.dy * normal.y;
            
            // 反射向量
            const reflectDir = {
                dx: dir.dx - 2 * dotProduct * normal.x,
                dy: dir.dy - 2 * dotProduct * normal.y
            };
            
            // 归一化
            const reflectLen = Math.sqrt(reflectDir.dx * reflectDir.dx + reflectDir.dy * reflectDir.dy);
            reflectDir.dx /= reflectLen;
            reflectDir.dy /= reflectLen;
            
            // 判断是反射还是反射+透射
            if (mirror.player === laserColor) {
                // 同色：既反射又透射
                return {
                    point: intersection,
                    type: 'both',
                    reflectDirection: reflectDir,
                    transmitDirection: dir
                };
            } else {
                // 异色：只反射
                return {
                    point: intersection,
                    type: 'reflect',
                    newDirection: reflectDir
                };
            }
        }
    }
    
    return null;
}

function lineSegmentIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    
    if (Math.abs(denom) < 1e-10) {
        return null; // 平行或重合
    }
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (u >= 0 && u <= 1) {
        // 交点在镜子线段上
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1),
            onSegment: true,
            t: t,
            u: u
        };
    }
    
    return null;
}

// 检查激光是否能击中目标基地
function canLaserHitBase(attackerBase, attackerColor, defenderBase, mirrors, gridSize) {
    const directions = [
        {dx: 1, dy: 0},  // 右
        {dx: -1, dy: 0}, // 左
        {dx: 0, dy: 1},  // 下
        {dx: 0, dy: -1}  // 上
    ];
    
    for (const dir of directions) {
        const path = traceLaser(attackerBase, dir, mirrors, attackerColor, gridSize);
        
        // 检查路径是否通过防守方基地
        for (const point of path) {
            const cellX = Math.floor(point.x);
            const cellY = Math.floor(point.y);
            
            if (cellX === defenderBase.x && cellY === defenderBase.y) {
                return true;
            }
        }
    }
    
    return false;
}

// 获取所有可能的镜子放置位置
function getAllPossibleMirrors(player, redBase, blueBase, existingMirrors, gridSize) {
    const possibleMirrors = [];
    
    // 遍历所有可能的镜子位置
    for (let x1 = 0; x1 <= gridSize; x1++) {
        for (let y1 = 0; y1 <= gridSize; y1++) {
            // 尝试连接到相邻的点
            const neighbors = [
                {x: x1 + 1, y: y1},     // 右
                {x: x1, y: y1 + 1},     // 下
                {x: x1 + 1, y: y1 + 1}, // 右下对角
                {x: x1 - 1, y: y1 + 1}  // 左下对角
            ];
            
            for (const neighbor of neighbors) {
                if (neighbor.x < 0 || neighbor.x > gridSize || 
                    neighbor.y < 0 || neighbor.y > gridSize) {
                    continue;
                }
                
                const mirror = {
                    x1, y1,
                    x2: neighbor.x,
                    y2: neighbor.y,
                    player
                };
                
                // 检查是否有效
                if (isValidMirrorPlacement(mirror, redBase, blueBase, existingMirrors)) {
                    possibleMirrors.push(mirror);
                }
            }
        }
    }
    
    return possibleMirrors;
}

function isValidMirrorPlacement(mirror, redBase, blueBase, existingMirrors) {
    const {x1, y1, x2, y2} = mirror;
    
    // 检查两点是否相同
    if (x1 === x2 && y1 === y2) {
        return false;
    }
    
    // 检查是否占据基地
    if (redBase && isMirrorOnCell(mirror, redBase)) return false;
    if (blueBase && isMirrorOnCell(mirror, blueBase)) return false;
    
    // 检查是否与现有镜子重叠
    for (const existing of existingMirrors) {
        if (mirrorsOverlapOrIntersect(mirror, existing)) {
            return false;
        }
    }
    
    return true;
}

function isMirrorOnCell(mirror, cell) {
    const {x1, y1, x2, y2} = mirror;
    const {x, y} = cell;
    
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

function mirrorsOverlapOrIntersect(m1, m2) {
    // 检查是否完全重合
    if ((m1.x1 === m2.x1 && m1.y1 === m2.y1 && m1.x2 === m2.x2 && m1.y2 === m2.y2) ||
        (m1.x1 === m2.x2 && m1.y1 === m2.y2 && m1.x2 === m2.x1 && m1.y2 === m2.y1)) {
        return true;
    }
    
    // 检查是否共享端点
    const sharePoint = (
        (m1.x1 === m2.x1 && m1.y1 === m2.y1) ||
        (m1.x1 === m2.x2 && m1.y1 === m2.y2) ||
        (m1.x2 === m2.x1 && m1.y2 === m2.y1) ||
        (m1.x2 === m2.x2 && m1.y2 === m2.y2)
    );
    
    if (sharePoint) {
        const dx1 = m1.x2 - m1.x1;
        const dy1 = m1.y2 - m1.y1;
        const dx2 = m2.x2 - m2.x1;
        const dy2 = m2.y2 - m2.y1;
        
        if ((dx1 === dx2 && dy1 === dy2) || (dx1 === -dx2 && dy1 === -dy2)) {
            return true;
        }
    }
    
    return false;
}
