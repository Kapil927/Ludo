class VIPLogic {
    constructor(gameState, vipPlayerId) {
        this.gameState = gameState;
        this.vipPlayerId = vipPlayerId;
        this.vipPlayer = gameState.players.find(p => p.userId === vipPlayerId);
        this.otherPlayers = gameState.players.filter(p => p.userId !== vipPlayerId);
    }

    // Main function to decide dice value
    calculateOptimalDice() {
        const gamePhase = this.analyzeGamePhase();
        
        switch(gamePhase) {
            case 'early':
                return this.earlyGameStrategy();
            case 'mid':
                return this.midGameStrategy();
            case 'late':
                return this.lateGameStrategy();
            case 'critical':
                return this.criticalMomentStrategy();
            default:
                return this.getNormalDice();
        }
    }

    analyzeGamePhase() {
        const vipTokensOut = this.vipPlayer.tokens.filter(t => !t.isHome).length;
        const vipFinished = this.vipPlayer.tokens.filter(t => t.isFinished).length;
        const totalVipProgress = this.vipPlayer.tokens.reduce((sum, token) => sum + token.position, 0);

        // Check if VIP is in danger
        const isInDanger = this.isVIPInDanger();
        
        if (isInDanger) return 'critical';
        if (vipFinished >= 3) return 'late';
        if (vipTokensOut >= 2 || totalVipProgress > 20) return 'mid';
        return 'early';
    }

    isVIPInDanger() {
        // Check if any VIP token can be cut by opponents
        for (const token of this.vipPlayer.tokens) {
            if (token.isHome || token.isFinished) continue;
            
            for (const player of this.otherPlayers) {
                for (const opponentToken of player.tokens) {
                    if (opponentToken.isHome || opponentToken.isFinished) continue;
                    
                    // Check if opponent is close enough to cut
                    const distance = Math.abs(opponentToken.position - token.position);
                    if (distance <= 6 && !token.safePositions.includes(token.position)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    earlyGameStrategy() {
        // In early game, get 6 to move tokens out
        if (Math.random() < 0.7) {
            return 6; // High chance of 6 to start
        }
        return this.getWeightedDice([5, 6, 1]);
    }

    midGameStrategy() {
        // Check for cutting opportunities
        const cuttingOpportunity = this.findCuttingOpportunity();
        if (cuttingOpportunity && Math.random() < 0.6) {
            return cuttingOpportunity.requiredDice;
        }

        // Check if need to escape
        const escapeNeed = this.findEscapeNeed();
        if (escapeNeed && Math.random() < 0.7) {
            return escapeNeed.requiredDice;
        }

        // Otherwise get good moving numbers
        return this.getWeightedDice([6, 5, 4]);
    }

    lateGameStrategy() {
        // Focus on finishing tokens
        const finishingMove = this.findFinishingMove();
        if (finishingMove && Math.random() < 0.8) {
            return finishingMove.requiredDice;
        }

        // Sometimes give bad roll to look realistic (10% chance)
        if (Math.random() < 0.1) {
            return this.getBadDice();
        }

        return this.getWeightedDice([6, 5, 4, 3]);
    }

    criticalMomentStrategy() {
        // When in danger, prioritize escape
        const escapeMove = this.findBestEscape();
        if (escapeMove && Math.random() < 0.8) {
            return escapeMove.requiredDice;
        }

        // If can't escape, try to cut back
        const revengeCut = this.findRevengeCut();
        if (revengeCut && Math.random() < 0.6) {
            return revengeCut.requiredDice;
        }

        return this.getSafeDice();
    }

    findCuttingOpportunity() {
        for (const player of this.otherPlayers) {
            for (const token of player.tokens) {
                if (token.isHome || token.isFinished || token.safePositions.includes(token.position)) continue;
                
                for (const vipToken of this.vipPlayer.tokens) {
                    if (vipToken.isHome || vipToken.isFinished) continue;
                    
                    const distance = token.position - vipToken.position;
                    if (distance > 0 && distance <= 6) {
                        return {
                            targetPlayer: player.userId,
                            requiredDice: distance,
                            canCut: true
                        };
                    }
                }
            }
        }
        return null;
    }

    findEscapeNeed() {
        for (const vipToken of this.vipPlayer.tokens) {
            if (vipToken.isHome || vipToken.isFinished) continue;
            
            // Check if any opponent can cut this token
            let closestThreat = Infinity;
            
            for (const player of this.otherPlayers) {
                for (const opponentToken of player.tokens) {
                    if (opponentToken.isHome || opponentToken.isFinished) continue;
                    
                    const distance = vipToken.position - opponentToken.position;
                    if (distance > 0 && distance <= 6 && !vipToken.safePositions.includes(vipToken.position)) {
                        closestThreat = Math.min(closestThreat, distance);
                    }
                }
            }
            
            if (closestThreat < Infinity) {
                // Find safe position within dice range
                for (let dice = 1; dice <= 6; dice++) {
                    const newPosition = vipToken.position + dice;
                    if (vipToken.safePositions.includes(newPosition)) {
                        return {
                            tokenId: vipToken.id,
                            requiredDice: dice,
                            fromPosition: vipToken.position,
                            toPosition: newPosition
                        };
                    }
                }
            }
        }
        return null;
    }

    findFinishingMove() {
        for (const token of this.vipPlayer.tokens) {
            if (token.isHome || token.isFinished) continue;
            
            const distanceToFinish = 57 - token.position; // Assuming 57 is finish
            if (distanceToFinish > 0 && distanceToFinish <= 6) {
                return {
                    tokenId: token.id,
                    requiredDice: distanceToFinish,
                    canFinish: true
                };
            }
        }
        return null;
    }

    findBestEscape() {
        let bestEscape = null;
        let bestSafetyScore = -1;

        for (const vipToken of this.vipPlayer.tokens) {
            if (vipToken.isHome || vipToken.isFinished) continue;
            
            for (let dice = 1; dice <= 6; dice++) {
                const newPosition = vipToken.position + dice;
                const safetyScore = this.calculateSafetyScore(newPosition, vipToken);
                
                if (safetyScore > bestSafetyScore) {
                    bestSafetyScore = safetyScore;
                    bestEscape = {
                        tokenId: vipToken.id,
                        requiredDice: dice,
                        safetyScore: safetyScore
                    };
                }
            }
        }
        return bestEscape;
    }

    findRevengeCut() {
        // Look for opportunities to cut opponents who are threatening VIP
        return this.findCuttingOpportunity(); // Reuse cutting logic
    }

    calculateSafetyScore(position, token) {
        let score = 0;
        
        // Base score for safe positions
        if (token.safePositions.includes(position)) {
            score += 100;
        }
        
        // Penalty for being in cutting range
        for (const player of this.otherPlayers) {
            for (const opponentToken of player.tokens) {
                if (opponentToken.isHome || opponentToken.isFinished) continue;
                
                const distance = position - opponentToken.position;
                if (distance > 0 && distance <= 6) {
                    score -= 50;
                }
            }
        }
        
        // Bonus for progress
        score += position * 0.5;
        
        return score;
    }

    getWeightedDice(preferredValues) {
        // Create weighted probabilities
        const weights = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]; // Base weights
        
        // Increase weights for preferred values
        preferredValues.forEach(val => {
            weights[val - 1] = 0.25; // Higher probability
        });
        
        // Normalize weights
        const total = weights.reduce((a, b) => a + b, 0);
        const normalized = weights.map(w => w / total);
        
        // Generate random number based on weights
        const rand = Math.random();
        let sum = 0;
        
        for (let i = 0; i < normalized.length; i++) {
            sum += normalized[i];
            if (rand <= sum) {
                return i + 1;
            }
        }
        
        return Math.floor(Math.random() * 6) + 1;
    }

    getSafeDice() {
        // Get dice that won't put VIP in danger
        const safeOptions = [];
        
        for (let dice = 1; dice <= 6; dice++) {
            let isSafe = true;
            
            for (const token of this.vipPlayer.tokens) {
                if (token.isHome || token.isFinished) continue;
                
                const newPosition = token.position + dice;
                // Check if any opponent can reach this new position
                for (const player of this.otherPlayers) {
                    for (const opponentToken of player.tokens) {
                        if (opponentToken.isHome || opponentToken.isFinished) continue;
                        
                        const distance = newPosition - opponentToken.position;
                        if (distance > 0 && distance <= 6 && !token.safePositions.includes(newPosition)) {
                            isSafe = false;
                            break;
                        }
                    }
                    if (!isSafe) break;
                }
                if (!isSafe) break;
            }
            
            if (isSafe) safeOptions.push(dice);
        }
        
        return safeOptions.length > 0 
            ? safeOptions[Math.floor(Math.random() * safeOptions.length)]
            : this.getNormalDice();
    }

    getBadDice() {
        // Return a less useful dice (1 or 2)
        return Math.random() < 0.5 ? 1 : 2;
    }

    getNormalDice() {
        return Math.floor(Math.random() * 6) + 1;
    }
}

module.exports = VIPLogic;