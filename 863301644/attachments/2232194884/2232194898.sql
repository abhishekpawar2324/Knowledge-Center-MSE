CREATE TABLE [dbo].[Shipment]
(
[ShipmentId] numeric(18) primary key, [ShipmentData] date,
[shipmentNumber] numeric, [ShipmentTime] time);


CREATE TABLE [dbo].[Container]
(
[ContainerId] numeric(18) primary key, 
[SSCCId] date, [Fk_shipmentId] numeric);


CREATE TABLE [dbo].[Items]
(
[ItemNo] numeric(18) primary key, [ItemName] nvarchar (50), 
IContainerId numeric,
[LoadNo] numeric);

CREATE TABLE [dbo].[Orders]
(
[OrderNo] numeric(18) primary key, [OrderDate] date,
[OShipmentNo] numeric);