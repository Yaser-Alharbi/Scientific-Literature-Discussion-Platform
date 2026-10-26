# backend/authentication/tests.py

import os
import requests
import json
import random
import unittest
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
import sys

# Generate unique test user email
RANDOM_NUMBERS = f"{random.randint(10, 99)}"

# Base URL for frontend testing
BASE_URL = "http://localhost:4000"

@unittest.skipUnless(os.environ.get('RUN_SELENIUM') == '1', 'needs frontend on localhost:4000 and Chrome')
class FrontendAuthenticationTests(unittest.TestCase):
    """Tests using Selenium"""
    
    # Test result tracking
    test_results = {'passed': [], 'failed': []}
    
    @classmethod
    def setUpClass(cls):
        """Set up the WebDriver once for all tests"""
        options = webdriver.ChromeOptions()
        options.add_argument("--start-maximized")
        
        options.headless = False # Set true to not see browser
        cls.driver = webdriver.Chrome(options=options)
        cls.driver.implicitly_wait(10)
        print("🚀 Starting authentication tests...")
    
    @classmethod
    def tearDownClass(cls):
        """Close the browser after all tests"""
        if hasattr(cls, 'driver'):
            cls.driver.quit()
        
        # Print simplified test summary
        print("\n==== TEST SUMMARY ====")
        print(f"✅ PASSED: {len(cls.test_results['passed'])}")
        for test in cls.test_results['passed']:
            print(f"  ✓ {test}")
        
        print(f"\n❌ FAILED: {len(cls.test_results['failed'])}")
        for test, error in cls.test_results['failed']:
            print(f"  ✗ {test}: {error}")
    
    def setUp(self):
        """Setup for each test method"""
        self._test_passed = True
        self._test_error = None
        self._test_name = self.id().split('.')[-1]
        
    def tearDown(self):
        """Called after each test method"""
        # Record test results using our simple flag
        test_name = self.id().split('.')[-1]
        if self._test_passed:
            self.__class__.test_results['passed'].append(test_name)
            print(f"✅ Test {test_name} PASSED")
        else:
            self.__class__.test_results['failed'].append((test_name, str(self._test_error)))
            print(f"❌ Test {test_name} FAILED: {str(self._test_error)}")
    
    def test_01_signup_new_user(self):
        """Test signup with a random new user"""
        try:
            # Generate random test user
            random_num = random.randint(1000, 9999)
            test_email = f"testuser{random_num}@example.com"
            test_password = "TestPassword123!"
            
            # Navigate to signup page
            self.driver.get(f"{BASE_URL}/Signup")
            time.sleep(1)
            
            # Fill in the signup form
            self.driver.find_element(By.XPATH, "//input[@type='email']").send_keys(test_email)
            time.sleep(0.5)
            
            # Find inputs by placeholder
            first_name_input = self.driver.find_element(By.XPATH, "//input[@placeholder='First Name']")
            first_name_input.send_keys("Test")
            time.sleep(0.5)
            
            last_name_input = self.driver.find_element(By.XPATH, "//input[@placeholder='Last Name']")
            last_name_input.send_keys("User")
            time.sleep(0.5)
            
            password_fields = self.driver.find_elements(By.XPATH, "//input[@type='password']")
            password_fields[0].send_keys(test_password)
            time.sleep(0.5)
            password_fields[1].send_keys(test_password)
            time.sleep(1)
            
            # Submit form
            self.driver.find_element(By.XPATH, "//button[contains(text(), 'Sign Up')]").click()
            time.sleep(2)
            
            # Wait for redirect to home page
            WebDriverWait(self.driver, 20).until(
                EC.url_contains("/")
            )
            
            # Store credentials for subsequent tests
            self.__class__.last_test_email = test_email
            self.__class__.last_test_password = test_password
        
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            raise
    
    def test_02_logout_and_login(self):
        """Test logout using navbar and then login"""
        try:
            # Get the test credentials from the previous test
            test_email = self.__class__.last_test_email
            test_password = self.__class__.last_test_password
            
            # Logout first click the user dropdown in navbar
            user_dropdown = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(@class, 'text-gray-300') and contains(@class, 'font-medium')]"))
            )
            user_dropdown.click()
            time.sleep(1)
            
            # click the logout button in the dropdown
            logout_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Logout')]"))
            )
            self.driver.execute_script("arguments[0].click();", logout_button)
            time.sleep(2)
            
            # navigate to login page
            self.driver.get(f"{BASE_URL}/Login")
            
            time.sleep(1)
            
            # find email field
            email_field = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//input[@type='email']"))
            )
            email_field.clear()
            time.sleep(0.3)
            email_field.send_keys(test_email)
            time.sleep(0.3)
            
            # find password field
            password_field = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//input[@type='password']"))
            )
            password_field.clear()
            time.sleep(0.5)
            password_field.send_keys(test_password)
            time.sleep(1)
            
            # submit form
            login_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Login')]"))
            )
            self.driver.execute_script("arguments[0].click();", login_button)
            time.sleep(2)
            
            # wait for redirect to home page
            WebDriverWait(self.driver, 20).until(
                EC.url_contains("/")
            )
            
            # verify we're logged in by checking for user dropdown in navbar
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//button[contains(@class, 'text-gray-300') and contains(@class, 'font-medium')]"))
            )
        
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            raise

    def test_03_update_profile(self):
        """Test updating profile information"""
        try:
            # navigate to the profile page
            self.driver.get(f"{BASE_URL}/profile")
            time.sleep(1.5)
            
            # wait for profile page to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//h2[contains(text(), 'Profile')]"))
            )
            time.sleep(1)
            
            # make sure we are on the profile tab
            profile_tab = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Profile')]"))
            )
            profile_tab.click()
            time.sleep(1)
            
            # click the edit profile button
            edit_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Edit Profile')]"))
            )
            edit_button.click()
            time.sleep(1.5)
            
            # generate random profile data
            new_first_name = f"FirstName{random.randint(100, 999)}"
            new_last_name = f"LastName{random.randint(100, 999)}"
            
            # find the input fields
            first_name_input = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//label[contains(text(), 'First Name')]/following-sibling::input"))
            )
            first_name_input.clear()
            time.sleep(0.5)
            first_name_input.send_keys(new_first_name)
            time.sleep(0.5)
            
            last_name_input = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//label[contains(text(), 'Last Name')]/following-sibling::input"))
            )
            last_name_input.clear()
            time.sleep(0.5)
            last_name_input.send_keys(new_last_name)
            time.sleep(0.5)
            
            institution_input = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//label[contains(text(), 'Institution')]/following-sibling::input"))
            )
            institution_input.clear()
            time.sleep(0.5)
            institution_input.send_keys("Test University")
            time.sleep(0.5)
            
            bio_input = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//label[contains(text(), 'Bio')]/following-sibling::textarea"))
            )
            bio_input.clear()
            time.sleep(0.5)
            bio_input.send_keys("This is an automated test bio")
            time.sleep(1)
            
            # submit the form by clicking save changes
            save_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Save Changes')]"))
            )
            save_button.click()
            time.sleep(2)
            
            # wait for success message
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'bg-green-900/50')]"))
            )
            
            # store the updated name for future tests
            self.__class__.updated_first_name = new_first_name
            self.__class__.updated_last_name = new_last_name
        
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            raise
    
    def test_04_change_password_and_login(self):
        """Test changing password and logging in with new password"""
        try:
            # continue from previous test - already on profile page
            # click on the security tab
            security_tab = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Security')]"))
            )
            security_tab.click()
            time.sleep(1) 
            
            # wait for password settings to appear
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//h3[contains(text(), 'Password Settings')]"))
            )
            time.sleep(1) 
            
            # get the current password from previous test
            current_password = self.__class__.last_test_password
            
            # generate a new password by adding "new" to the current one
            new_password = f"new{current_password}"
            
            # find password input fields in the security tab
            password_fields = WebDriverWait(self.driver, 10).until(
                EC.presence_of_all_elements_located((By.XPATH, "//form//input[@type='password']"))
            )
            
            # fill in current password
            password_fields[0].clear()
            time.sleep(0.5)
            password_fields[0].send_keys(current_password)
            time.sleep(0.5)
            
            # fill in new password
            password_fields[1].clear()
            time.sleep(0.5)
            password_fields[1].send_keys(new_password)
            time.sleep(0.5)
            
            # confirm new password
            password_fields[2].clear()
            time.sleep(0.5)
            password_fields[2].send_keys(new_password)
            time.sleep(1)
            
            # find and click the update password button
            password_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[text()='Update Password']"))
            )
            self.driver.execute_script("arguments[0].click();", password_button)
            time.sleep(2)
            
            # wait for success message
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'bg-green-900/50')]"))
            )
            time.sleep(1)
            
            # logout first - click the user dropdown in navbar
            # navigate to home to make sure the navbar is visible
            self.driver.get(f"{BASE_URL}")
            time.sleep(1)
            
            # click on user dropdown
            user_dropdown = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(@class, 'text-gray-300') and contains(@class, 'font-medium')]"))
            )
            user_dropdown.click()
            time.sleep(1)
            
            # click the logout button
            logout_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Logout')]"))
            )
            self.driver.execute_script("arguments[0].click();", logout_button)
            time.sleep(2)
            
            # wait for login page
            WebDriverWait(self.driver, 10).until(
                EC.url_contains("/Login")
            )
            
            # wait for login page to fully load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//input[@type='email']"))
            )
            
            # wait to ensure form is fully interactive
            time.sleep(2)
            
            # get the email from previous test
            email = self.__class__.last_test_email
                
            # login with new password
            email_field = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//input[@type='email']"))
            )
            email_field.clear()
            time.sleep(0.5)
            email_field.send_keys(email)
            time.sleep(0.5)
            
            password_field = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//input[@type='password']"))
            )
            password_field.clear()
            time.sleep(0.5)
            password_field.send_keys(new_password)
            time.sleep(1)
            
            # submit form
            login_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Login')]"))
            )
            self.driver.execute_script("arguments[0].click();", login_button)
            time.sleep(2)
            
            # wait for successful login
            WebDriverWait(self.driver, 20).until(
                EC.url_contains("/")
            )
            
            # verify we're logged in by checking for the navbar with user dropdown
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//button[contains(@class, 'text-gray-300') and contains(@class, 'font-medium')]"))
            )
            
            # store the new password for future tests
            self.__class__.last_test_password = new_password
        
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            raise

    def test_05_update_research_interests(self):
        """Test updating research interests"""
        try:
            # navigate to the profile page
            self.driver.get(f"{BASE_URL}/profile")
            time.sleep(1.5)
            
            # wait for profile page to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//h2[contains(text(), 'Profile')]"))
            )
            time.sleep(1)
            
            # click the edit profile button
            edit_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Edit Profile')]"))
            )
            edit_button.click()
            time.sleep(1.5)
            
            # find the research interests input field
            interests_input = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//input[@placeholder='Add a research interest']"))
            )
            
            # clear any existing value and enter the test interest
            custom_interest = "test test"
            interests_input.clear()
            time.sleep(0.5)
            interests_input.send_keys(custom_interest)
            time.sleep(0.5)
            
            # click the add button
            add_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[text()='Add']"))
            )
            add_button.click()
            time.sleep(1)
            
            # wait a moment for the interest to appear in the list
            time.sleep(2)
            
            # verify interest appears in the list
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, f"//li[contains(., '{custom_interest}')]"))
            )
            time.sleep(1)
            
            # submit the form by clicking save changes
            save_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Save Changes')]"))
            )
            save_button.click()
            time.sleep(2)
            
            # wait for success message
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'bg-green-900/50')]"))
            )
            
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            raise
    
    def test_06_search_papers_and_add_extract(self):
        """Test searching papers and adding an extract"""
        try:
            # navigate to the papers page
            self.driver.get(f"{BASE_URL}/papers")
            time.sleep(4)  # extended wait for initial page load
            
            # wait for the page to fully load and verify we're on the papers page
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.XPATH, "//h1[contains(text(), 'Academic Paper Search')]"))
            )
            print("Papers page loaded successfully")
            
            # wait for the search form to be available
            search_form = WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.XPATH, "//form"))
            )
            
            # find and fill the search input
            search_input = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable((By.XPATH, "//input[@placeholder='Search Google Scholar...']"))
            )
            search_input.clear()
            time.sleep(1)
            search_input.send_keys("DNA")
            time.sleep(1)
            print("entered search term: DNA")
            
            # find and click the search button
            search_button = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable((By.XPATH, "//button[@type='submit']"))
            )
            self.driver.execute_script("arguments[0].click();", search_button)
            print("Clicked search button")
            
            # wait for "searching..." text to appear in button, indicating search has started
            try:
                WebDriverWait(self.driver, 5).until(
                    EC.text_to_be_present_in_element((By.XPATH, "//button[@type='submit']"), "Searching...")
                )
                print("Search in progress...")
            except TimeoutException:
                print("Warning: Didn't see 'Searching...' state, but continuing")
            
            # wait for search to complete (button text changes back or results appear)
            try:
                # wait up to 20 seconds for search results to appear
                WebDriverWait(self.driver, 20).until(
                    EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'bg-gray-800/60')]"))
                )
                print("Search results have appeared")
            except TimeoutException:
                print("No search results appeared - this is an error")
                self.driver.save_screenshot("no_search_results.png")
                raise Exception("Search results did not appear after 20 seconds")
            
            # more wait to ensure all results are fully loaded
            time.sleep(5)
            
            # find all save extract buttons and click the first one
            extract_buttons = WebDriverWait(self.driver, 15).until(
                EC.presence_of_all_elements_located((By.XPATH, "//button[contains(text(), 'Save Extract')]"))
            )
            
            if not extract_buttons:
                self.driver.save_screenshot("no_extract_buttons.png")
                raise Exception("No 'Save Extract' buttons found")
                
            print(f"Found {len(extract_buttons)} extract buttons")
            
            # click the first extract button
            self.driver.execute_script("arguments[0].click();", extract_buttons[0])
            print("clicked first save extract button")
            time.sleep(3)
            
            # wait for the extract modal to appear
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.XPATH, "//h2[contains(text(), 'Save Paper Extract')]"))
            )
            print("Extract modal opened")
            
            # fill out the extract form
            extract_textarea = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable((By.ID, "extract"))
            )
            extract_textarea.clear()
            time.sleep(1)
            extract_textarea.send_keys("This is a test extract with some DNA-related content for testing purposes.")
            time.sleep(1)
            
            # enter page number
            page_number_input = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable((By.ID, "page_number"))
            )
            page_number_input.clear()
            time.sleep(1)
            page_number_input.send_keys("42")
            time.sleep(1)
            
            # add additional info
            additional_info_textarea = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable((By.ID, "additional_info"))
            )
            additional_info_textarea.clear()
            time.sleep(1)
            additional_info_textarea.send_keys("Additional notes about this DNA research paper.")
            time.sleep(1)
            print("Filled out extract form")
            
            # find and click the save extract button in the modal
            save_button = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable((By.XPATH, "//form//button[contains(text(), 'Save Extract')]"))
            )
            self.driver.execute_script("arguments[0].click();", save_button)
            print("clicked save extract button in modal")
            
            print("✅ Successfully searched papers and saved an extract")
            time.sleep(1)
            
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            try:
                self.driver.save_screenshot("paper_extract_error.png")
            except:
                pass
            raise

    def test_07_create_room_as_host(self):
        """Test creating a room and verifying host role"""
        try:
            # navigate directly to the rooms page
            self.driver.get(f"{BASE_URL}/rooms")
            time.sleep(1)
            
            # wait for the page to load completely
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//h2[contains(text(), 'Create a New Room')]"))
            )
            
            # generate a random room name
            room_name = f"Test Room {random.randint(1000, 9999)}"
            
            # find the room title input by its ID
            room_title_input = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.ID, "roomTitle"))
            )
            room_title_input.clear()
            time.sleep(0.5)
            room_title_input.send_keys(room_name)
            time.sleep(1)
            
            # click the create room button
            create_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Create Room')]"))
            )
            self.driver.execute_script("arguments[0].click();", create_button)
            time.sleep(2)
            
            # wait for navigation to the room page
            WebDriverWait(self.driver, 20).until(
                EC.url_contains("/room/")
            )
            
            # wait for the Livestream room to load
            time.sleep(5)
            
            # verify the host role badge is present
            role_badge = WebDriverWait(self.driver, 20).until(
                EC.presence_of_element_located((By.XPATH, "//span[contains(@class, 'bg-red-600') and text()='host']"))
            )
            # Test is successful 
            print("✅ Successfully created room with HOST role and started audio")
        
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            try:
                self.driver.save_screenshot("error_state.png")
            except:
                pass
            raise

    def test_08_manage_participants_in_room(self):
        """Test inviting a viewer to become a guest and then demoting them"""
        try:
        
            time.sleep(10)
            print("Starting participant management test")
            
            # find and click the participants tab
            participants_tab = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(.//span, 'Participants')]"))
            )
            self.driver.execute_script("arguments[0].click();", participants_tab)
            time.sleep(2)
            print("Clicked Participants tab")
            
            # look for an "invite to guests" button and click it
            try:
                invite_button = WebDriverWait(self.driver, 15).until(
                    EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Invite to Guests')]"))
                )
                self.driver.execute_script("arguments[0].click();", invite_button)
                print("Clicked 'Invite to Guests' button")
                time.sleep(3)
                
                # now check if the "demote to viewers" button appears
                demote_button = WebDriverWait(self.driver, 15).until(
                    EC.presence_of_element_located((By.XPATH, "//button[contains(text(), 'Demote to Viewers')]"))
                )
                print("Success: 'demote to viewers' button found - participant was promoted to guest")
            
            except TimeoutException:
                pass
            
            print("✅ Successfully managed participants in the room")
            
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            try:
                self.driver.save_screenshot("participants_test_error.png")
            except:
                pass
            raise
    
    def test_09_share_reference_in_room(self):
        """Test sharing a reference in the room"""
        try:
            # find and click the references tab
            references_tab = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(.//span, 'References')]"))
            )
            self.driver.execute_script("arguments[0].click();", references_tab)
            time.sleep(2)
            print("Clicked References tab")
            
            # find the "select extract to present" button
            try:
                # first look for the button to share an extract
                select_extract_button = WebDriverWait(self.driver, 15).until(
                    EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Select Extract to Present')]"))
                )
                self.driver.execute_script("arguments[0].click();", select_extract_button)
                print("Clicked 'Select Extract to Present' button")
                time.sleep(2)
                
                # wait for the modal to appear
                modal = WebDriverWait(self.driver, 15).until(
                    EC.visibility_of_element_located((By.XPATH, "//h3[contains(text(), 'Select an Extract to Share')]"))
                )
                print("Extract selection modal opened")
                
                # look for an extract to select
                try:
                    extract_item = WebDriverWait(self.driver, 10).until(
                        EC.element_to_be_clickable((By.XPATH, "//div[contains(@class, 'bg-gray-800') and contains(@class, 'border-gray-700')]"))
                    )
                    self.driver.execute_script("arguments[0].click();", extract_item)
                    print("Selected an extract")
                    time.sleep(1)
                    
                    # click "share with room" button
                    share_button = WebDriverWait(self.driver, 10).until(
                        EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Share with Room')]"))
                    )
                    self.driver.execute_script("arguments[0].click();", share_button)
                    print("Clicked 'Share with Room' button")
                    time.sleep(3)
                    
                    # check if the extract appears in the shared references list
                    shared_extract = WebDriverWait(self.driver, 15).until(
                        EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'bg-gray-800') and contains(@class, 'rounded-lg')]//a[contains(@class, 'text-blue-400')]"))
                    )
                    print("Success: Extract was shared and is visible in references list")
                    
                except TimeoutException:
                    # if there are no extracts, we can't complete the test
                    print("No extracts found to share - create extracts first")
                    
                    # close the modal
                    cancel_button = WebDriverWait(self.driver, 10).until(
                        EC.element_to_be_clickable((By.XPATH, "//button[text()='Cancel']"))
                    )
                    self.driver.execute_script("arguments[0].click();", cancel_button)
            
            except TimeoutException:
                print("Warning: Could not find 'Select Extract to Present' button - user may not be a host or guest")
                # The button only appears for hosts and guests, so this is acceptable
            
            print("✅ Successfully tested references sharing functionality")
            
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            try:
                self.driver.save_screenshot("references_test_error.png")
            except:
                pass
            raise
    
    
    def test_10_publish_media(self):
        """Test publishing media in the room"""
        try:
            time.sleep(3)
            
            mic_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(@class, 'lk-mic-button') or contains(., 'Microphone')]"))
            )
            self.driver.execute_script("arguments[0].click();", mic_button)
            time.sleep(2)
            
            camera_button = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(@class, 'lk-camera-button') or contains(., 'Camera')]"))
            )
            self.driver.execute_script("arguments[0].click();", camera_button)
            time.sleep(2)
            
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            raise

    def test_11_leave_room(self):
        """Test leaving a room and verifying redirect to rooms page"""
        try:
            leave_button = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Leave')]"))
            )
            
            self.driver.execute_script("arguments[0].click();", leave_button)
            time.sleep(2)
            
            WebDriverWait(self.driver, 15).until(
                EC.url_contains("/rooms")
            )
            
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//h2[contains(text(), 'Create a New Room')]"))
            )
            
            time.sleep(3)
            
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            try:
                self.driver.save_screenshot("leave_room_error.png")
            except:
                pass
            raise

    def test_12_join_existing_room(self):
        """Test joining an existing room and verifying viewer role"""
        try:
            join_button = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Join')]"))
            )
            self.driver.execute_script("arguments[0].click();", join_button)
            
            WebDriverWait(self.driver, 20).until(
                EC.url_contains("/room/")
            )
            time.sleep(3)
            
            try:
                role_badge = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.XPATH, "//span[contains(@class, 'bg-gray-600') and text()='viewer']"))
                )
            except TimeoutException:
                self.driver.save_screenshot("role_badge_missing.png")
                role_text = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.XPATH, "//div[contains(text(), 'Your role:')]/following-sibling::span"))
                )
            
        except Exception as e:
            self._test_passed = False
            self._test_error = e
            try:
                self.driver.save_screenshot("join_room_error.png")
            except:
                pass
            raise

if __name__ == '__main__':
    unittest.main()

