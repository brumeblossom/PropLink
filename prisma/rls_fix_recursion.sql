-- ==============================================================================
-- RLS Policy Recursion Fix & Leases Storage Policies
-- ==============================================================================

-- 1. Helper Functions (SECURITY DEFINER, public schema, stable, owned by postgres)
-- Breaking mutual recursion between properties, units, and leases RLS policies.

CREATE OR REPLACE FUNCTION public.is_property_landlord(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.properties
    WHERE id = p_property_id
      AND landlord_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_property_landlord(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_property_landlord(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_property_landlord(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.is_unit_landlord(p_unit_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.units u
    JOIN public.properties p ON p.id = u.property_id
    WHERE u.id = p_unit_id
      AND p.landlord_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_unit_landlord(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_unit_landlord(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_unit_landlord(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.is_unit_tenant(p_unit_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leases
    WHERE unit_id = p_unit_id
      AND tenant_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_unit_tenant(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_unit_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_unit_tenant(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.is_property_tenant(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.units u
    JOIN public.leases l ON l.unit_id = u.id
    WHERE u.property_id = p_property_id
      AND l.tenant_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_property_tenant(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_property_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_property_tenant(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.can_access_lease(p_lease_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leases l
    JOIN public.units u ON u.id = l.unit_id
    JOIN public.properties p ON p.id = u.property_id
    WHERE l.id = p_lease_id
      AND (l.tenant_id = auth.uid() OR p.landlord_id = auth.uid())
  );
$$;

ALTER FUNCTION public.can_access_lease(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.can_access_lease(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_lease(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.is_lease_landlord(p_lease_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leases l
    JOIN public.units u ON u.id = l.unit_id
    JOIN public.properties p ON p.id = u.property_id
    WHERE l.id = p_lease_id
      AND p.landlord_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_lease_landlord(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_lease_landlord(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lease_landlord(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.lease_id_from_path(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_parts text[];
  v_target text;
BEGIN
  v_parts := storage.foldername(p_name);
  IF v_parts IS NULL OR array_length(v_parts, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_parts[1] = 'payments' THEN
    IF array_length(v_parts, 1) >= 2 THEN
      v_target := v_parts[2];
    ELSE
      RETURN NULL;
    END IF;
  ELSE
    v_target := v_parts[1];
  END IF;

  IF v_target IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v_target::uuid;
  ELSE
    RETURN NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

ALTER FUNCTION public.lease_id_from_path(text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.lease_id_from_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lease_id_from_path(text) TO service_role;


CREATE OR REPLACE FUNCTION public.can_delete_own_proof(p_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payments
    WHERE proof_url = p_name
      AND recorded_by = auth.uid()
      AND status = 'pending'
  );
$$;

ALTER FUNCTION public.can_delete_own_proof(text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.can_delete_own_proof(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_own_proof(text) TO service_role;


-- 2. Rewrite Mutually Recursive Table Policies

-- PROPERTIES: tenant_read_properties_policy
DROP POLICY IF EXISTS tenant_read_properties_policy ON public.properties;
CREATE POLICY tenant_read_properties_policy ON public.properties
  FOR SELECT
  USING (is_property_tenant(id));

-- UNITS: landlord_units_policy
DROP POLICY IF EXISTS landlord_units_policy ON public.units;
CREATE POLICY landlord_units_policy ON public.units
  FOR ALL
  USING (is_property_landlord(property_id))
  WITH CHECK (is_property_landlord(property_id));

-- UNITS: tenant_read_units_policy
DROP POLICY IF EXISTS tenant_read_units_policy ON public.units;
CREATE POLICY tenant_read_units_policy ON public.units
  FOR SELECT
  USING (is_unit_tenant(id));

-- LEASES: landlord_leases_policy
DROP POLICY IF EXISTS landlord_leases_policy ON public.leases;
CREATE POLICY landlord_leases_policy ON public.leases
  FOR ALL
  USING (is_unit_landlord(unit_id))
  WITH CHECK (is_unit_landlord(unit_id));


-- 3. Storage Policies for Bucket 'leases'
-- Files are stored as "<leaseId>/<timestamp>.<ext>" or legacy "payments/<leaseId>/<timestamp>.<ext>"

DROP POLICY IF EXISTS "Allow authenticated select for lease/payment files" ON storage.objects;
DROP POLICY IF EXISTS "Allow landlord upload lease files" ON storage.objects;
DROP POLICY IF EXISTS "Allow tenant/landlord upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "leases_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "leases_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "leases_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "leases_delete_policy" ON storage.objects;

-- SELECT: bucket_id = 'leases' and can_access_lease(...)
CREATE POLICY "leases_select_policy" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'leases'
    AND can_access_lease(lease_id_from_path(name))
  );

-- INSERT: bucket_id = 'leases' and can_access_lease(...)
CREATE POLICY "leases_insert_policy" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'leases'
    AND can_access_lease(lease_id_from_path(name))
  );

-- UPDATE: bucket_id = 'leases' and the landlord of that lease only
CREATE POLICY "leases_update_policy" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'leases'
    AND is_lease_landlord(lease_id_from_path(name))
  )
  WITH CHECK (
    bucket_id = 'leases'
    AND is_lease_landlord(lease_id_from_path(name))
  );

-- DELETE: bucket_id = 'leases' and either landlord of that lease or owner of pending payment proof
CREATE POLICY "leases_delete_policy" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'leases'
    AND (
      is_lease_landlord(lease_id_from_path(name))
      OR can_delete_own_proof(name)
    )
  );
