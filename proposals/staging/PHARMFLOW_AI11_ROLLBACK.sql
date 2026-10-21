-- Staging ONLY. Restore old client first; inspect live helper before applying.
CREATE OR REPLACE FUNCTION pharmflow_expiry_private.scan_facts(p_raw text, p_format text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare s text:=btrim(p_raw,E' \r\n\t');v_ai text;v_value text;v_facts jsonb:='{}';v_stop integer;v_fixed integer;
begin
 if s is null or s='' then raise exception 'Raw scan required';end if;
 if s ~ '^\][A-Za-z][0-9]' then s:=substr(s,4);end if;
 if p_format='PLAIN' then return jsonb_build_object('identifier',s);end if;
 if p_format is distinct from 'GS1' then raise exception 'Invalid scan format';end if;
 while length(s)>0 loop
  if left(s,1)=chr(29) then s:=substr(s,2);continue;end if;
  if left(s,1)='(' then
   if s !~ '^\((01|17|10|21)\)' then raise exception 'Unsupported GS1 AI';end if;
   v_ai:=substr(s,2,2);s:=substr(s,5);v_stop:=strpos(s,'(');if v_stop=0 then v_stop:=length(s)+1;end if;
   v_value:=substr(s,1,v_stop-1);s:=substr(s,v_stop);
  else
   v_ai:=left(s,2);s:=substr(s,3);v_fixed:=case v_ai when '01' then 14 when '17' then 6 else null end;
   if v_ai not in ('01','17','10','21') then raise exception 'Unsupported GS1 AI';end if;
   if v_fixed is not null then v_value:=left(s,v_fixed);s:=substr(s,v_fixed+1);
   else v_stop:=strpos(s,chr(29));if v_stop=0 then v_stop:=length(s)+1;end if;v_value:=left(s,v_stop-1);s:=substr(s,v_stop);end if;
  end if;
  if v_facts ? v_ai then raise exception 'Duplicate GS1 AI';end if;
  if (v_ai='01' and v_value !~ '^[0-9]{14}$') or (v_ai='17' and v_value !~ '^[0-9]{6}$') or (v_ai in ('10','21') and length(v_value) not between 1 and 20) then raise exception 'Invalid GS1 value';end if;
  v_facts:=v_facts||jsonb_build_object(v_ai,v_value);
 end loop;
 if not v_facts ? '01' then raise exception 'GS1 GTIN required';end if;
 return v_facts||jsonb_build_object('identifier',v_facts->>'01');
end $function$
