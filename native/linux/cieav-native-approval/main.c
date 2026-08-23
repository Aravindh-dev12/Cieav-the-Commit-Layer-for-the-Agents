#include <gio/gio.h>
#include <json-glib/json-glib.h>
#include <stdlib.h>
#include <string.h>

#define MAX_INPUT_BYTES 64000

typedef struct {
  GMainLoop *loop;
  GDBusProxy *proxy;
  guint notification_id;
  gchar *challenge_id;
  JsonNode *approve;
  JsonNode *deny;
  GUri *callback;
  gboolean callback_ok;
  gboolean decided;
} App;

static gboolean is_hex64(const gchar *s){if(!s||strlen(s)!=64)return FALSE;for(const gchar *p=s;*p;p++)if(!g_ascii_isxdigit(*p))return FALSE;return TRUE;}
static const gchar *str_member(JsonObject *o,const gchar *name){return json_object_has_member(o,name)?json_object_get_string_member(o,name):NULL;}
static gboolean bool_member(JsonObject *o,const gchar *name){return json_object_has_member(o,name)&&json_object_get_boolean_member(o,name);}

static gboolean validate_capability(JsonNode *node,const gchar *decision){
  if(!node||!JSON_NODE_HOLDS_OBJECT(node))return FALSE;JsonObject *cap=json_node_get_object(node);JsonNode *pn=json_object_get_member(cap,"payload");const gchar *mac=str_member(cap,"mac");
  if(!pn||!JSON_NODE_HOLDS_OBJECT(pn)||!mac||strlen(mac)!=43)return FALSE;for(const gchar *p=mac;*p;p++)if(!(g_ascii_isalnum(*p)||*p=='_'||*p=='-'))return FALSE;
  JsonObject *p=json_node_get_object(pn);const gchar *version=str_member(p,"version"),*challenge=str_member(p,"challengeId"),*device=str_member(p,"deviceId"),*request=str_member(p,"requestId"),*proposal=str_member(p,"proposalId"),*digest=str_member(p,"proposalDigest"),*principal=str_member(p,"principalId"),*resource=str_member(p,"resource"),*actual=str_member(p,"decision"),*expires=str_member(p,"expiresAt"),*nonce=str_member(p,"nonce");
  if(g_strcmp0(version,"CIEAV_NATIVE_APPROVAL_ACTIVATION_V1")||g_strcmp0(actual,decision)||bool_member(p,"authority")||bool_member(p,"executionAuthorityIssued"))return FALSE;
  if(!challenge||!g_uuid_string_is_valid(challenge)||!proposal||!g_uuid_string_is_valid(proposal)||!device||strlen(device)<8||strlen(device)>200||!request||strlen(request)<8||strlen(request)>128||!principal||!*principal||strlen(principal)>240||!resource||!*resource||strlen(resource)>500||!is_hex64(digest)||!is_hex64(nonce)||!expires)return FALSE;
  GDateTime *dt=g_date_time_new_from_iso8601(expires,NULL);if(!dt)return FALSE;g_date_time_unref(dt);return TRUE;
}
static gboolean same_binding(JsonNode *a_node,JsonNode *d_node){JsonObject *a=json_node_get_object(json_object_get_member(json_node_get_object(a_node),"payload")),*d=json_node_get_object(json_object_get_member(json_node_get_object(d_node),"payload"));for(const gchar **k=(const gchar*[]){"challengeId","deviceId","proposalDigest","expiresAt",NULL};*k;k++)if(g_strcmp0(str_member(a,*k),str_member(d,*k)))return FALSE;return TRUE;}
static GUri *parse_callback(const gchar *raw){GError *error=NULL;GUri *u=g_uri_parse(raw,G_URI_FLAGS_NONE,&error);if(error){g_error_free(error);return NULL;}const gchar *scheme=g_uri_get_scheme(u),*host=g_uri_get_host(u),*path=g_uri_get_path(u),*query=g_uri_get_query(u),*fragment=g_uri_get_fragment(u),*userinfo=g_uri_get_userinfo(u);gint port=g_uri_get_port(u);if(g_strcmp0(scheme,"http")||g_strcmp0(host,"127.0.0.1")||g_strcmp0(path,"/api/native-approval")||query||fragment||userinfo||port<1024||port>65535){g_uri_unref(u);return NULL;}return u;}
static gchar *clean_text(const gchar *raw,gsize max){if(!raw)return g_strdup("");GString *s=g_string_new(NULL);gboolean space=FALSE;for(const gchar *p=raw;*p&&s->len<max;p++){if(g_ascii_isspace(*p)){space=TRUE;continue;}if(space&&s->len&&s->len<max)g_string_append_c(s,' ');space=FALSE;g_string_append_c(s,*p);}return g_string_free(s,FALSE);}

static gboolean post_capability(GUri *uri,JsonNode *capability){
  JsonGenerator *gen=json_generator_new();json_generator_set_root(gen,capability);gchar *cap=json_generator_to_data(gen,NULL),*body=g_strdup_printf("{\"capability\":%s}",cap);g_object_unref(gen);g_free(cap);
  GSocketClient *client=g_socket_client_new();g_socket_client_set_timeout(client,3);GError *error=NULL;GSocketConnection *conn=g_socket_client_connect_to_host(client,"127.0.0.1",g_uri_get_port(uri),NULL,&error);if(!conn){if(error)g_error_free(error);g_object_unref(client);g_free(body);return FALSE;}
  gchar *request=g_strdup_printf("POST /api/native-approval HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nContent-Type: application/json\r\nContent-Length: %zu\r\nConnection: close\r\n\r\n%s",g_uri_get_port(uri),strlen(body),body);g_free(body);
  GOutputStream *out=g_io_stream_get_output_stream(G_IO_STREAM(conn));gsize written=0;gboolean ok=g_output_stream_write_all(out,request,strlen(request),&written,NULL,&error)&&written==strlen(request);g_free(request);if(!ok){if(error)g_error_free(error);g_io_stream_close(G_IO_STREAM(conn),NULL,NULL);g_object_unref(conn);g_object_unref(client);return FALSE;}
  GDataInputStream *din=g_data_input_stream_new(g_io_stream_get_input_stream(G_IO_STREAM(conn)));gsize line_len=0;gchar *line=g_data_input_stream_read_line(din,&line_len,NULL,&error);ok=line&&(g_str_has_prefix(line,"HTTP/1.1 2")||g_str_has_prefix(line,"HTTP/1.0 2"));g_free(line);if(error)g_error_free(error);g_object_unref(din);g_io_stream_close(G_IO_STREAM(conn),NULL,NULL);g_object_unref(conn);g_object_unref(client);return ok;
}

static gboolean expire_cb(gpointer data){App *app=data;if(app->loop)g_main_loop_quit(app->loop);return G_SOURCE_REMOVE;}
static void signal_cb(GDBusProxy *proxy,gchar *sender_name,gchar *signal_name,GVariant *parameters,gpointer data){(void)proxy;(void)sender_name;App *app=data;if(g_strcmp0(signal_name,"ActionInvoked"))return;guint id=0;const gchar *action=NULL;g_variant_get(parameters,"(u&s)",&id,&action);if(id!=app->notification_id||app->decided)return;JsonNode *selected=NULL;if(!g_strcmp0(action,"approve"))selected=app->approve;else if(!g_strcmp0(action,"deny"))selected=app->deny;else return;app->decided=TRUE;app->callback_ok=post_capability(app->callback,selected);g_main_loop_quit(app->loop);}

int main(void){
  GByteArray *input=g_byte_array_new();guint8 buf[4096];while(!feof(stdin)){size_t n=fread(buf,1,sizeof(buf),stdin);if(n){if(input->len+n>MAX_INPUT_BYTES){g_byte_array_unref(input);return 2;}g_byte_array_append(input,buf,n);}if(ferror(stdin)){g_byte_array_unref(input);return 2;}}g_byte_array_append(input,(const guint8*)"\0",1);
  JsonParser *parser=json_parser_new();GError *error=NULL;if(!json_parser_load_from_data(parser,(const gchar*)input->data,input->len-1,&error)){if(error)g_error_free(error);g_object_unref(parser);g_byte_array_unref(input);return 2;}g_byte_array_unref(input);JsonNode *root=json_parser_get_root(parser);if(!root||!JSON_NODE_HOLDS_OBJECT(root)){g_object_unref(parser);return 2;}JsonObject *o=json_node_get_object(root);
  const gchar *version=str_member(o,"version"),*title=str_member(o,"title"),*message=str_member(o,"message"),*risk=str_member(o,"risk"),*expires_raw=str_member(o,"expiresAt"),*callback_raw=str_member(o,"callbackUrl");JsonNode *approve=json_object_get_member(o,"approve"),*deny=json_object_get_member(o,"deny");if(g_strcmp0(version,"CIEAV_NATIVE_APPROVAL_UI_V1")||!title||!message||!risk||!expires_raw||!callback_raw||!validate_capability(approve,"APPROVED")||!validate_capability(deny,"DENIED")||!same_binding(approve,deny)){g_object_unref(parser);return 2;}
  GUri *callback=parse_callback(callback_raw);if(!callback){g_object_unref(parser);return 3;}GDateTime *expires=g_date_time_new_from_iso8601(expires_raw,NULL),*now=g_date_time_new_now_utc();if(!expires||g_date_time_compare(expires,now)<=0){if(expires)g_date_time_unref(expires);g_date_time_unref(now);g_uri_unref(callback);g_object_unref(parser);return 4;}gint64 remaining_ms=(g_date_time_to_unix(expires)-g_date_time_to_unix(now))*1000;g_date_time_unref(now);
  GDBusProxy *proxy=g_dbus_proxy_new_for_bus_sync(G_BUS_TYPE_SESSION,G_DBUS_PROXY_FLAGS_DO_NOT_AUTO_START,NULL,"org.freedesktop.Notifications","/org/freedesktop/Notifications","org.freedesktop.Notifications",NULL,&error);if(!proxy){if(error)g_error_free(error);g_date_time_unref(expires);g_uri_unref(callback);g_object_unref(parser);return 8;}
  gchar *summary=clean_text(title,80),*body_text=clean_text(message,220),*risk_text=clean_text(risk,16),*body=g_strdup_printf("%s\nRisk: %s",body_text,risk_text);g_free(body_text);g_free(risk_text);
  GVariantBuilder actions;g_variant_builder_init(&actions,G_VARIANT_TYPE("as"));g_variant_builder_add(&actions,"s","approve");g_variant_builder_add(&actions,"s","Allow once");g_variant_builder_add(&actions,"s","deny");g_variant_builder_add(&actions,"s","Block");GVariantBuilder hints;g_variant_builder_init(&hints,G_VARIANT_TYPE("a{sv}"));g_variant_builder_add(&hints,"{sv}","urgency",g_variant_new_byte(2));
  gint timeout=(gint)MIN(remaining_ms,G_MAXINT);GVariant *reply=g_dbus_proxy_call_sync(proxy,"Notify",g_variant_new("(susss@as@a{sv}i)","CIEAV",0,"",summary,body,g_variant_builder_end(&actions),g_variant_builder_end(&hints),timeout),G_DBUS_CALL_FLAGS_NONE,5000,NULL,&error);g_free(summary);g_free(body);if(!reply){if(error)g_error_free(error);g_object_unref(proxy);g_date_time_unref(expires);g_uri_unref(callback);g_object_unref(parser);return 7;}guint notification_id=0;g_variant_get(reply,"(u)",&notification_id);g_variant_unref(reply);
  App app={0};app.loop=g_main_loop_new(NULL,FALSE);app.proxy=proxy;app.notification_id=notification_id;JsonObject *ap=json_node_get_object(json_object_get_member(json_node_get_object(approve),"payload"));app.challenge_id=g_strdup(str_member(ap,"challengeId"));app.approve=json_node_copy(approve);app.deny=json_node_copy(deny);app.callback=callback;g_signal_connect(proxy,"g-signal",G_CALLBACK(signal_cb),&app);g_timeout_add((guint)MAX(1,MIN(remaining_ms,G_MAXUINT)),expire_cb,&app);g_main_loop_run(app.loop);
  g_dbus_proxy_call(proxy,"CloseNotification",g_variant_new("(u)",notification_id),G_DBUS_CALL_FLAGS_NONE,1000,NULL,NULL,NULL);int code=app.decided?(app.callback_ok?0:6):0;g_main_loop_unref(app.loop);g_free(app.challenge_id);json_node_free(app.approve);json_node_free(app.deny);g_object_unref(proxy);g_date_time_unref(expires);g_uri_unref(callback);g_object_unref(parser);return code;
}
