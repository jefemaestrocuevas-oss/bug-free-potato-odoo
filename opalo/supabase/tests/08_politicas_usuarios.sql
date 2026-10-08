-- Pruebas · publicar_politica (R13), inmutabilidad de lo firmado y alta de usuarios (tg_nuevo_usuario)
begin;

do $$
declare
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_v1 uuid := (select id from public.politicas where tipo = 'privacidad' and activa);
  v_nueva uuid;
begin
  perform pruebas.como(v_admin);
  v_nueva := public.publicar_politica('privacidad', '  Aviso de privacidad (v2)  ', E'# Ignorado\n\nTexto *nuevo*.');
  perform pruebas.como_postgres();
  perform pruebas.igual((select version from public.politicas where id = v_nueva), 2, 'versión = max + 1');
  perform pruebas.igual((select titulo from public.politicas where id = v_nueva), 'Aviso de privacidad (v2)', 'título sin espacios');
  perform pruebas.igual((select activa from public.politicas where id = v_nueva), true, 'la nueva queda activa');
  perform pruebas.igual((select activa from public.politicas where id = v_v1), false, 'la anterior se desactiva');
  perform pruebas.igual((select count(*)::int from public.politicas where tipo = 'privacidad' and activa), 1, 'una sola activa por tipo');
  perform pruebas.igual((select hash_sha256 from public.politicas where id = v_nueva),
                        encode(sha256(convert_to(E'# Ignorado\n\nTexto *nuevo*.', 'UTF8')), 'hex'), 'hash del contenido');
  perform pruebas.afirma((select vigente_desde is not null from public.politicas where id = v_nueva), 'vigente desde');

  perform pruebas.como(v_admin);
  perform public.publicar_politica('privacidad', 'Aviso (v3)', 'Otro texto.');
  perform pruebas.espera_error('select public.publicar_politica(''privacidad'', '' '', ''x'')',
    'Escribe el título y el contenido de la política.');
  perform pruebas.como_postgres();
  perform pruebas.igual((select max(version) from public.politicas where tipo = 'privacidad'), 3, 'v3');

  -- Dos activas del mismo tipo: imposible
  begin
    update public.politicas set activa = true where tipo = 'privacidad' and version = 1;
    raise exception 'FALLA: quedaron dos políticas activas del mismo tipo';
  exception when unique_violation then
    null;
  end;

  -- Lo que ya se aceptó o firmó no se edita: se publica una versión nueva
  perform pruebas.espera_error(format('update public.politicas set contenido_md = %L where id = %L', 'cambio', v_v1),
    'Esta versión ya fue aceptada o firmada por alguna clienta: publica una versión nueva.');
  update public.politicas set contenido_md = 'Corrección antes de que nadie la acepte.' where id = v_nueva;
  perform pruebas.igual((select hash_sha256 from public.politicas where id = v_nueva),
                        encode(sha256(convert_to('Corrección antes de que nadie la acepte.', 'UTF8')), 'hex'),
                        'si nadie la ha aceptado, se puede corregir y el hash se recalcula');
  raise notice 'OK - publicar_politica versiona, activa una sola y protege lo ya aceptado';
end $$;

-- Alta de usuarios: perfil + clienta, o vinculación con la clienta que ya había registrado el personal
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_previa uuid;
  v_usuario uuid;
  v_n int := (select count(*) from public.clientes);
begin
  perform pruebas.como(v_esp);
  insert into public.clientes (nombre, apellidos, email, notas_internas)
  values ('Lucía', 'Mostrador', 'Lucia.Prueba@Ejemplo.mx', 'Vino por recomendación') returning id into v_previa;
  perform pruebas.como_postgres();

  v_usuario := pruebas.crear_usuario('lucia.prueba@ejemplo.mx',
    '{"nombre": "Lucy", "apellidos": "Otra", "telefono": "4425555555", "fecha_nacimiento": "1995-07-20"}');
  perform pruebas.igual((select id from public.clientes where usuario_id = v_usuario), v_previa, 'se vincula por email (sin importar mayúsculas)');
  perform pruebas.igual((select count(*)::int from public.clientes), v_n + 1, 'no se duplica la clienta');
  perform pruebas.igual((select nombre || ' ' || apellidos || ' ' || telefono || ' ' || fecha_nacimiento::text
                           from public.clientes where id = v_previa),
                        'Lucía Mostrador 4425555555 1995-07-20', 'conserva lo capturado y completa los huecos');
  perform pruebas.igual((select rol::text from public.perfiles where id = v_usuario), 'cliente', 'perfil con rol cliente');

  v_usuario := pruebas.crear_usuario('nueva.prueba@ejemplo.mx',
    '{"nombre": "Nueva", "apellidos": "Clienta", "telefono": "4426666666", "fecha_nacimiento": "no-es-fecha"}');
  perform pruebas.igual((select nombre || '/' || apellidos || '/' || telefono || '/' || coalesce(fecha_nacimiento::text, 'null') || '/' || email
                           from public.clientes where usuario_id = v_usuario),
                        'Nueva/Clienta/4426666666/null/nueva.prueba@ejemplo.mx', 'crea la clienta con su metadata (fecha inválida → null)');

  v_usuario := pruebas.crear_usuario('Sin.Datos@Ejemplo.mx');
  perform pruebas.igual((select nombre || '/' || email from public.clientes where usuario_id = v_usuario),
                        'Sin.Datos/sin.datos@ejemplo.mx', 'sin metadata: nombre = parte del email');

  -- Si el email ya está ligado a otra cuenta, se crea sin email (no truena el registro)
  insert into auth.users (email) values ('clienta@demo.opalo.mx') returning id into v_usuario;
  perform pruebas.igual((select email from public.clientes where usuario_id = v_usuario), null::text, 'email repetido → sin email');

  -- Al borrar la cuenta, la clienta se conserva (usuario_id → null) y el perfil se borra
  delete from auth.users where id = v_usuario;
  perform pruebas.igual((select count(*)::int from public.perfiles where id = v_usuario), 0, 'perfil borrado en cascada');
  raise notice 'OK - tg_nuevo_usuario crea o vincula a la clienta';
end $$;

-- La clienta lee sus documentos firmados con su versión exacta
do $$
declare
  v_ana uuid := pruebas.usuario('clienta@demo.opalo.mx');
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
begin
  perform pruebas.como(v_admin);
  perform public.publicar_politica('consentimiento_depilacion', 'Consentimiento depilación (v2)', 'Texto nuevo.');
  perform pruebas.como(v_ana);
  perform pruebas.afirma((select count(*) from public.consentimientos co
                            join public.politicas p on p.id = co.politica_id
                           where p.tipo = 'consentimiento_depilacion' and p.version = 1) >= 3,
                         'la clienta ve la versión 1 que firmó aunque ya no esté activa');
  perform pruebas.como_postgres();
  raise notice 'OK - documentos firmados visibles para su dueña';
end $$;

rollback;
