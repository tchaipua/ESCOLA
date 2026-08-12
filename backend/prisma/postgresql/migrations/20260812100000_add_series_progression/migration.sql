ALTER TABLE "series" ADD COLUMN "nextSeriesId" TEXT;
CREATE INDEX "series_nextSeriesId_idx" ON "series"("nextSeriesId");
ALTER TABLE "series" ADD CONSTRAINT "series_nextSeriesId_fkey" FOREIGN KEY ("nextSeriesId") REFERENCES "series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
