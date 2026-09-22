import os
import tempfile
import unittest

import server


class ServerApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_database = server.DATABASE
        server.DATABASE = os.path.join(self.temp_dir.name, 'test.db')
        server.init_db()
        self.client = server.app.test_client()

    def tearDown(self):
        server.DATABASE = self.original_database
        self.temp_dir.cleanup()

    def test_init_returns_seeded_data(self):
        response = self.client.get('/api/init')

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload['user']['id'], 'local-user')
        self.assertGreaterEqual(len(payload['categories']), 5)
        self.assertGreaterEqual(len(payload['instruments']), 4)
        self.assertEqual(payload['sessions'], [])

    def test_library_and_current_session_lifecycle(self):
        category_id = self.client.get('/api/categories').get_json()[0]['id']
        library_response = self.client.post('/api/library', json={
            'name': 'Test Exercise',
            'categoryId': category_id,
            'starRating': 0,
            'notes': ''
        })
        self.assertEqual(library_response.status_code, 201)
        library_item = library_response.get_json()

        session_response = self.client.post('/api/sessions/current', json={
            'instrumentId': 'inst-guitar',
            'status': 'running',
            'items': [{
                'id': 'session-item-1',
                'libraryItemId': library_item['id'],
                'name': library_item['name'],
                'categoryId': category_id,
                'timeSpent': 0
            }]
        })
        self.assertEqual(session_response.status_code, 200)

        update_response = self.client.put(
            '/api/sessions/current/items/session-item-1',
            json={'timeSpent': 60000}
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.get_json()['items'][0]['time_spent'], 60000)

        clear_response = self.client.delete('/api/sessions/current')
        self.assertEqual(clear_response.status_code, 204)
        self.assertIsNone(self.client.get('/api/sessions/current').get_json())

    def test_duplicate_library_items_are_rejected(self):
        category_id = self.client.get('/api/categories').get_json()[0]['id']
        payload = {'name': 'Unique Exercise', 'categoryId': category_id}
        self.assertEqual(self.client.post('/api/library', json=payload).status_code, 201)
        duplicate = self.client.post('/api/library', json=payload)
        self.assertEqual(duplicate.status_code, 409)

    def test_export_and_invalid_payload(self):
        export_response = self.client.get('/api/export')
        self.assertEqual(export_response.status_code, 200)
        self.assertIn('categories', export_response.get_json())

        invalid_response = self.client.post('/api/library', data='not-json')
        self.assertEqual(invalid_response.status_code, 400)

        invalid_theme = self.client.post('/api/theme', json={'theme': 'sepia'})
        self.assertEqual(invalid_theme.status_code, 400)

        invalid_import = self.client.post('/api/import', json={'unexpected': []})
        self.assertEqual(invalid_import.status_code, 400)

        invalid_session = self.client.post('/api/sessions', json={
            'status': 'broken', 'items': []
        })
        self.assertEqual(invalid_session.status_code, 400)

        missing_session = self.client.put('/api/sessions/missing', json={
            'status': 'completed', 'items': []
        })
        self.assertEqual(missing_session.status_code, 404)

        missing_category = self.client.put('/api/categories/missing', json={
            'name': 'Missing', 'type': 'Missing'
        })
        self.assertEqual(missing_category.status_code, 404)

    def test_session_history_pagination(self):
        for index in range(3):
            response = self.client.post('/api/sessions', json={
                'instrumentId': 'inst-guitar',
                'status': 'completed',
                'date': f'2026-01-0{index + 1}T00:00:00',
                'totalTime': 60000,
                'items': []
            })
            self.assertEqual(response.status_code, 201)

        response = self.client.get('/api/sessions?limit=2&offset=1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.get_json()), 2)

        invalid_page = self.client.get('/api/sessions?limit=bad')
        self.assertEqual(invalid_page.status_code, 400)

        init_page = self.client.get('/api/init?sessionLimit=2&sessionOffset=1')
        self.assertEqual(init_page.status_code, 200)
        init_payload = init_page.get_json()
        self.assertEqual(init_payload['sessionTotal'], 3)
        self.assertEqual(init_payload['sessionLimit'], 2)
        self.assertEqual(init_payload['sessionOffset'], 1)
        self.assertEqual(len(init_payload['sessions']), 2)

        invalid_init_page = self.client.get('/api/init?sessionLimit=bad')
        self.assertEqual(invalid_init_page.status_code, 400)

    def test_statistics_and_session_item_cleanup(self):
        session = self.client.post('/api/sessions', json={
            'instrumentId': 'inst-guitar',
            'status': 'completed',
            'date': '2026-01-01T00:00:00',
            'totalTime': 120000,
            'items': [{
                'id': 'cleanup-item',
                'name': 'Practice',
                'categoryId': 'cat-song',
                'timeSpent': 120000
            }]
        }).get_json()
        summary = self.client.get('/api/statistics/summary').get_json()
        self.assertGreaterEqual(summary['allTime'], 120000)

        self.assertEqual(self.client.delete(f"/api/sessions/{session['id']}").status_code, 204)
        remaining = self.client.get('/api/sessions').get_json()
        self.assertFalse(any(item['id'] == session['id'] for item in remaining))

    def test_current_session_can_be_cancelled(self):
        response = self.client.post('/api/sessions/current', json={
            'instrumentId': 'inst-guitar', 'status': 'running', 'items': []
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.delete('/api/sessions/current').status_code, 204)
        self.assertIsNone(self.client.get('/api/sessions/current').get_json())

    def test_export_import_round_trip(self):
        exported = self.client.get('/api/export').get_json()
        imported = self.client.post('/api/import', json=exported)
        self.assertEqual(imported.status_code, 200)
        self.assertEqual(imported.get_json()['status'], 'success')

    def test_import_remaps_duplicate_parent_ids_without_replacing_rows(self):
        category = self.client.get('/api/categories').get_json()[0]
        instrument = self.client.get('/api/instruments').get_json()[0]
        payload = {
            'categories': [{'id': 'backup-category', 'name': category['name'], 'type': category['type']}],
            'instruments': [{'id': 'backup-instrument', 'name': instrument['name']}],
            'library_items': [{
                'id': 'backup-library-item', 'name': 'Backup Item',
                'category_id': 'backup-category'
            }],
            'sessions': [{
                'id': 'backup-session', 'instrument_id': 'backup-instrument',
                'status': 'completed', 'date': '2026-01-01T00:00:00'
            }],
            'session_items': [{
                'id': 'backup-session-item', 'session_id': 'backup-session',
                'library_item_id': 'backup-library-item', 'name': 'Backup Item',
                'category_id': 'backup-category'
            }]
        }
        response = self.client.post('/api/import', json=payload)
        self.assertEqual(response.status_code, 200)

        library_item = self.client.get('/api/library').get_json()[-1]
        self.assertEqual(library_item['category_id'], category['id'])
        session = self.client.get('/api/sessions').get_json()[0]
        self.assertEqual(session['instrument_id'], instrument['id'])
        self.assertEqual(session['items'][0]['library_item_id'], 'backup-library-item')
        self.assertEqual(session['items'][0]['category_id'], category['id'])

    def test_current_session_item_update_cannot_modify_history(self):
        historical = self.client.post('/api/sessions', json={
            'instrumentId': 'inst-guitar', 'status': 'completed',
            'date': '2026-01-01T00:00:00',
            'items': [{'id': 'historical-item', 'name': 'History', 'timeSpent': 1000}]
        })
        self.assertEqual(historical.status_code, 201)
        current = self.client.post('/api/sessions/current', json={
            'instrumentId': 'inst-guitar', 'status': 'running', 'items': []
        })
        self.assertEqual(current.status_code, 200)

        response = self.client.put('/api/sessions/current/items/historical-item', json={'timeSpent': 9999})
        self.assertEqual(response.status_code, 404)

    def test_failed_import_rolls_back(self):
        before = self.client.get('/api/categories').get_json()
        invalid_import = self.client.post('/api/import', json={
            'categories': [{'id': 'rollback-category', 'name': 'Rollback'}],
            'library_items': [{
                'id': 'invalid-reference',
                'name': 'Invalid',
                'category_id': 'does-not-exist'
            }]
        })
        self.assertEqual(invalid_import.status_code, 400)
        after = self.client.get('/api/categories').get_json()
        self.assertEqual(after, before)

    def test_page_routes_and_core_assets(self):
        for path in ('/', '/sessions', '/library', '/statistics', '/settings'):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertIn(b'FretLog', response.data)

        for path in ('/static/js/data.js', '/static/js/utils.js', '/manifest.json', '/sw.js'):
            with self.client.get(path) as response:
                self.assertEqual(response.status_code, 200)


if __name__ == '__main__':
    unittest.main()
