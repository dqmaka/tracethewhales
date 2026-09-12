-- DropIndex
DROP INDEX "Token_symbol_key";

-- CreateIndex
CREATE INDEX "Token_symbol_idx" ON "Token"("symbol");
