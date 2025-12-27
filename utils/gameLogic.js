class GameLogic {
    static calculateTokenPosition(startPosition, diceValue, color) {
        // Simplified Ludo movement logic
        let newPosition = startPosition + diceValue;
        
        // Handle board boundaries and home stretch
        if (newPosition > 56) {
            newPosition = 56; // Max position
        }
        
        return newPosition;
    }

    static canCutToken(attackerPos, defenderPos, defenderSafePositions) {
        if (defenderSafePositions.includes(defenderPos)) {
            return false; // Can't cut from safe position
        }
        
        return attackerPos === defenderPos;
    }

    static isSix(diceValue) {
        return diceValue === 6;
    }

    static getAvailableMoves(player, diceValue) {
        const moves = [];
        
        player.tokens.forEach((token, index) => {
            if (token.isFinished) return;
            
            if (token.isHome) {
                if (diceValue === 6) {
                    moves.push({
                        tokenIndex: index,
                        from: 'home',
                        to: 'start',
                        canMoveOut: true
                    });
                }
            } else {
                const newPosition = this.calculateTokenPosition(token.position, diceValue, player.color);
                
                moves.push({
                    tokenIndex: index,
                    from: token.position,
                    to: newPosition,
                    canMove: true,
                    canFinish: newPosition === 56
                });
            }
        });
        
        return moves;
    }
}

module.exports = GameLogic;