BEGIN;

-- 1. Transfer all stock moves, purchases, and supplier fixes from 1331 to 167
UPDATE stock_moves SET product_id = 167 WHERE product_id = 1331;
UPDATE product_supplier_fix SET product_id = 167 WHERE product_id = 1331;

-- 2. Consolidate any starting stock (it's stored as a string, so we cast to numeric, add, and cast back)
UPDATE products 
SET opening_stock = (
  COALESCE(NULLIF(opening_stock, '')::numeric, 0) + 
  COALESCE((SELECT NULLIF(opening_stock, '')::numeric FROM products WHERE id = 1331), 0)
)::text
WHERE id = 167;

-- 3. Delete the duplicated product
DELETE FROM products WHERE id = 1331;

COMMIT;
