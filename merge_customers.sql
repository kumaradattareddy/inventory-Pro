DO $$
DECLARE
  merge_rec RECORD;
BEGIN
  -- Create a temporary table to hold our merge mapping
  CREATE TEMP TABLE merge_data (
    orig_id integer,
    dup_ids integer[]
  );

  -- Insert all the mappings provided
  INSERT INTO merge_data (orig_id, dup_ids) VALUES
  (974, ARRAY[407, 429]),
  (352, ARRAY[362, 388]),
  (493, ARRAY[716, 692]),
  (1079, ARRAY[1080, 1093]),
  (723, ARRAY[790, 735]),
  (845, ARRAY[847, 851]),
  (860, ARRAY[863, 862]),
  (224, ARRAY[202, 439]),
  (603, ARRAY[706, 764]),
  (566, ARRAY[599, 583]),
  (770, ARRAY[785, 782]),
  (788, ARRAY[525, 812]),
  (360, ARRAY[78, 340]),
  (323, ARRAY[370]),
  (875, ARRAY[577]),
  (727, ARRAY[417]),
  (546, ARRAY[608]),
  (626, ARRAY[587]),
  (779, ARRAY[802]),
  (685, ARRAY[688]),
  (152, ARRAY[131]),
  (883, ARRAY[216]),
  (854, ARRAY[229]),
  (334, ARRAY[331]),
  (792, ARRAY[319]),
  (233, ARRAY[173]),
  (236, ARRAY[444]),
  (1051, ARRAY[1062]),
  (922, ARRAY[205]),
  (617, ARRAY[634]),
  (625, ARRAY[580]),
  (345, ARRAY[441]),
  (993, ARRAY[999]),
  (754, ARRAY[751]),
  (768, ARRAY[763]),
  (956, ARRAY[991]),
  (1096, ARRAY[1106]),
  (1017, ARRAY[1032]),
  (314, ARRAY[304]),
  (691, ARRAY[700]),
  (23, ARRAY[731]),
  (261, ARRAY[316]),
  (713, ARRAY[902]),
  (186, ARRAY[244]),
  (1085, ARRAY[1086]),
  (174, ARRAY[1119]),
  (21, ARRAY[18]),
  (667, ARRAY[690]),
  (952, ARRAY[954]),
  (258, ARRAY[519]),
  (726, ARRAY[819]),
  (678, ARRAY[661]),
  (816, ARRAY[557]),
  (512, ARRAY[564]),
  (612, ARRAY[715]),
  (380, ARRAY[375]),
  (686, ARRAY[679]),
  (877, ARRAY[619]),
  (467, ARRAY[180]),
  (670, ARRAY[1081]),
  (699, ARRAY[668]),
  (638, ARRAY[676]),
  (791, ARRAY[696]),
  (81, ARRAY[105]),
  (849, ARRAY[855]),
  (945, ARRAY[948]),
  (378, ARRAY[68]),
  (783, ARRAY[707]),
  (192, ARRAY[27]),
  (456, ARRAY[494]),
  (198, ARRAY[176]),
  (104, ARRAY[702]),
  (733, ARRAY[867]),
  (20, ARRAY[74]),
  (755, ARRAY[805]),
  (534, ARRAY[518]),
  (742, ARRAY[662]),
  (330, ARRAY[537]),
  (701, ARRAY[843]),
  (211, ARRAY[614]),
  (544, ARRAY[773]),
  (740, ARRAY[582]),
  (848, ARRAY[903]),
  (672, ARRAY[665]),
  (846, ARRAY[144]),
  (125, ARRAY[177]),
  (866, ARRAY[502]),
  (683, ARRAY[719]),
  (336, ARRAY[252]),
  (521, ARRAY[442]),
  (165, ARRAY[363]),
  (187, ARRAY[530]),
  (333, ARRAY[367]),
  (220, ARRAY[448]),
  (445, ARRAY[511]),
  (223, ARRAY[245]),
  (684, ARRAY[659]),
  (615, ARRAY[633]),
  (254, ARRAY[396]),
  (656, ARRAY[704]),
  (404, ARRAY[430]),
  (320, ARRAY[395]),
  (410, ARRAY[422]),
  (561, ARRAY[326]),
  (829, ARRAY[234]),
  (994, ARRAY[852]),
  (250, ARRAY[894]),
  (835, ARRAY[895]),
  (897, ARRAY[558]),
  (453, ARRAY[468]),
  (484, ARRAY[517]);

  FOR merge_rec IN SELECT * FROM merge_data LOOP
    -- 1. Transfer any old records (bills, payments, stock) to the original ID
    UPDATE bill_adjustments SET customer_id = merge_rec.orig_id WHERE customer_id = ANY(merge_rec.dup_ids);
    UPDATE payments SET customer_id = merge_rec.orig_id WHERE customer_id = ANY(merge_rec.dup_ids);
    UPDATE stock_moves SET customer_id = merge_rec.orig_id WHERE customer_id = ANY(merge_rec.dup_ids);
    
    -- 2. Consolidate any starting balances into the original ID's balance
    UPDATE customers 
    SET opening_balance = opening_balance + (
      SELECT COALESCE(SUM(opening_balance), 0) FROM customers WHERE id = ANY(merge_rec.dup_ids)
    )
    WHERE id = merge_rec.orig_id;

    -- 3. Delete the duplicated records permanently
    DELETE FROM customers WHERE id = ANY(merge_rec.dup_ids);
  END LOOP;
  
  -- Cleanup
  DROP TABLE merge_data;
END $$;
