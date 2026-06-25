/*
  Warnings:

  - A unique constraint covering the columns `[deviceCode]` on the table `deviceCode` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userCode]` on the table `deviceCode` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "deviceCode_deviceCode_key" ON "deviceCode"("deviceCode");

-- CreateIndex
CREATE UNIQUE INDEX "deviceCode_userCode_key" ON "deviceCode"("userCode");
